interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * ACLED MCP — Armed Conflict Location & Event Data Project
 *
 * ACLED tracks political violence, demonstrations, and strategic developments
 * globally with date, lat/lon, actors, and fatalities. Pairs with GDELT for
 * geopolitical risk: GDELT for narrative sentiment, ACLED for incident counts.
 *
 * Auth: ACLED requires BOTH an API key and the email registered for that key.
 * - Platform: gateway injects _apiKey (from PLATFORM_ACLED_KEY) and _email
 *   (from PLATFORM_ACLED_EMAIL) per request.
 * - BYO: pass ?_apiKey=...&_email=... on the gateway URL.
 *
 * Register at https://developer.acleddata.com
 */


const BASE_URL = 'https://api.acleddata.com/acled/read';

const tools: McpToolExport['tools'] = [
  {
    name: 'search_events',
    description:
      'Search ACLED political-violence and protest events. Filter by country (use "|" to OR, e.g., "Ukraine|Russia"), region, event_type, actor, ISO country code, or date range. Returns date, lat/lon, actors, event type, fatalities, and source notes.',
    inputSchema: {
      type: 'object',
      properties: {
        country: { type: 'string', description: 'Country name(s), pipe-separated for OR' },
        region: { type: 'string', description: 'ACLED region (e.g., "Western Africa")' },
        event_type: {
          type: 'string',
          description:
            'Battles | Protests | Riots | Explosions/Remote violence | Violence against civilians | Strategic developments',
        },
        sub_event_type: { type: 'string', description: 'Optional ACLED sub-event type' },
        actor: { type: 'string', description: 'Match actor1 or actor2 (partial substring ok)' },
        iso: { type: 'number', description: 'ISO 3166-1 numeric country code (alternative to country)' },
        event_date_from: { type: 'string', description: 'YYYY-MM-DD inclusive' },
        event_date_to: { type: 'string', description: 'YYYY-MM-DD inclusive' },
        year: { type: 'number', description: 'Restrict to a calendar year' },
        fatalities_min: { type: 'number', description: 'Minimum fatalities filter' },
        limit: { type: 'number', description: 'Records to return (1-5000, default 100; ACLED max-per-call is 5000)' },
      },
      required: [],
    },
  },
  {
    name: 'event_counts_by_country',
    description:
      'Aggregate event and fatality counts by country over a date range. Useful for cross-country comparison and time-bounded risk snapshots.',
    inputSchema: {
      type: 'object',
      properties: {
        event_date_from: { type: 'string', description: 'YYYY-MM-DD inclusive' },
        event_date_to: { type: 'string', description: 'YYYY-MM-DD inclusive' },
        region: { type: 'string', description: 'Optional region restriction' },
        event_type: { type: 'string', description: 'Optional event-type restriction' },
        limit: { type: 'number', description: 'Underlying-event cap (1-5000, default 5000)' },
      },
      required: [],
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'search_events':
      return searchEvents(args);
    case 'event_counts_by_country':
      return countsByCountry(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function authParams(args: Record<string, unknown>): URLSearchParams {
  const apiKey = (args._apiKey as string | undefined)?.trim();
  const email = (args._email as string | undefined)?.trim();
  if (!apiKey || !email) {
    throw new Error(
      'ACLED requires both an API key and the registered email. Pass ?_apiKey=...&_email=... on the gateway URL, or contact the operator to configure platform credentials. Register: https://developer.acleddata.com',
    );
  }
  return new URLSearchParams({ key: apiKey, email });
}

function addFilters(params: URLSearchParams, args: Record<string, unknown>) {
  if (args.country) params.set('country', String(args.country));
  if (args.region) params.set('region', String(args.region));
  if (args.event_type) params.set('event_type', String(args.event_type));
  if (args.sub_event_type) params.set('sub_event_type', String(args.sub_event_type));
  if (args.actor) {
    // ACLED supports actor1 / actor2 separately; using "any" wildcard for either
    params.set('actor1', String(args.actor));
    params.set('actor1_where', 'LIKE');
  }
  if (args.iso) params.set('iso', String(args.iso));
  if (args.event_date_from && args.event_date_to) {
    params.set('event_date', `${args.event_date_from}|${args.event_date_to}`);
    params.set('event_date_where', 'BETWEEN');
  } else if (args.event_date_from) {
    params.set('event_date', String(args.event_date_from));
    params.set('event_date_where', '>=');
  } else if (args.event_date_to) {
    params.set('event_date', String(args.event_date_to));
    params.set('event_date_where', '<=');
  }
  if (args.year) params.set('year', String(args.year));
  if (args.fatalities_min) {
    params.set('fatalities', String(args.fatalities_min));
    params.set('fatalities_where', '>=');
  }
}

async function acledFetch(args: Record<string, unknown>, extraLimit?: number): Promise<EventRow[]> {
  const params = authParams(args);
  addFilters(params, args);
  const cap = Math.min(5000, Math.max(1, extraLimit ?? (args.limit as number) ?? 100));
  params.set('limit', String(cap));

  const res = await fetch(`${BASE_URL}?${params}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ACLED error: ${res.status} ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { success?: boolean; error?: { message?: string }[]; data?: EventRow[] };
  if (data.success === false) {
    const msg = data.error?.[0]?.message ?? 'unknown error';
    throw new Error(`ACLED: ${msg}`);
  }
  return data.data ?? [];
}

interface EventRow {
  data_id?: string;
  event_id_cnty?: string;
  event_date?: string;
  year?: string;
  event_type?: string;
  sub_event_type?: string;
  actor1?: string;
  actor2?: string;
  inter1?: string;
  inter2?: string;
  country?: string;
  iso?: string;
  region?: string;
  admin1?: string;
  admin2?: string;
  location?: string;
  latitude?: string;
  longitude?: string;
  fatalities?: string;
  notes?: string;
  source?: string;
  source_scale?: string;
}

async function searchEvents(args: Record<string, unknown>) {
  const rows = await acledFetch(args);
  return {
    count: rows.length,
    events: rows.map((r) => ({
      data_id: r.data_id ?? null,
      event_id_cnty: r.event_id_cnty ?? null,
      event_date: r.event_date ?? null,
      year: r.year ? Number(r.year) : null,
      event_type: r.event_type ?? null,
      sub_event_type: r.sub_event_type ?? null,
      actor1: r.actor1 ?? null,
      actor2: r.actor2 ?? null,
      country: r.country ?? null,
      iso: r.iso ? Number(r.iso) : null,
      region: r.region ?? null,
      admin1: r.admin1 ?? null,
      admin2: r.admin2 ?? null,
      location: r.location ?? null,
      latitude: r.latitude ? Number(r.latitude) : null,
      longitude: r.longitude ? Number(r.longitude) : null,
      fatalities: r.fatalities ? Number(r.fatalities) : 0,
      notes: r.notes ?? null,
      source: r.source ?? null,
      source_scale: r.source_scale ?? null,
    })),
  };
}

async function countsByCountry(args: Record<string, unknown>) {
  const rows = await acledFetch(args, 5000);
  const agg = new Map<string, { events: number; fatalities: number; by_type: Record<string, number> }>();
  for (const r of rows) {
    const c = r.country ?? 'Unknown';
    const slot = agg.get(c) ?? { events: 0, fatalities: 0, by_type: {} };
    slot.events += 1;
    slot.fatalities += r.fatalities ? Number(r.fatalities) : 0;
    const t = r.event_type ?? 'Unknown';
    slot.by_type[t] = (slot.by_type[t] ?? 0) + 1;
    agg.set(c, slot);
  }
  const out = Array.from(agg.entries())
    .map(([country, v]) => ({ country, ...v }))
    .sort((a, b) => b.events - a.events);

  return {
    total_events: rows.length,
    countries: out.length,
    truncated: rows.length >= 5000,
    breakdown: out,
  };
}

export default { tools, callTool, meter: { credits: 2 } } satisfies McpToolExport;
