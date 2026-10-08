import { GetParametersByPathCommand, SSMClient } from "@aws-sdk/client-ssm";

const client = new SSMClient({});
let cache;

export async function loadConfig() {
  if (cache) return cache;

  const prefix = process.env.SSM_PREFIX;
  if (!prefix) throw new Error("Falta SSM_PREFIX");

  const values = {};
  let nextToken;
  do {
    const out = await client.send(
      new GetParametersByPathCommand({
        Path: prefix,
        Recursive: true,
        WithDecryption: true,
        NextToken: nextToken,
      })
    );
    for (const p of out.Parameters ?? []) {
      values[p.Name.slice(prefix.length + 1)] = p.Value;
    }
    nextToken = out.NextToken;
  } while (nextToken);

  if (values.wompi_sandbox_status === "-") {
    values.wompi_sandbox_status = "";
  }

  cache = values;
  return cache;
}
