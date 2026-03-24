export type GraphQLErrorShape = { message: string };
export type GraphQLResponse<T> = { data?: T; errors?: GraphQLErrorShape[] };

export async function gql<TData, TVars extends Record<string, unknown> | undefined>(args: {
  apiUrl: string;
  query: string;
  variables?: TVars;
  token?: string;
}) {
  const res = await fetch(`${args.apiUrl.replace(/\/$/, '')}/graphql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(args.token ? { Authorization: `Bearer ${args.token}` } : {})
    },
    body: JSON.stringify({ query: args.query, variables: args.variables || undefined })
  });

  const json = (await res.json().catch(() => ({}))) as GraphQLResponse<TData>;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (json.errors?.length) throw new Error(json.errors[0]?.message || 'GraphQL error');
  if (!json.data) throw new Error('No data');
  return json.data;
}

