import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

function table() {
  return process.env.TABLE_NAME;
}

export function saleKeys(transactionId) {
  return { pk: `SALE#${transactionId}`, sk: "META" };
}

export async function putPendingSale({
  transactionId,
  email,
  amountInCents,
  reference,
  status,
}) {
  const now = new Date().toISOString();
  const day = now.slice(0, 10);
  await doc.send(
    new UpdateCommand({
      TableName: table(),
      Key: saleKeys(transactionId),
      UpdateExpression: `SET customerEmail = if_not_exists(customerEmail, :email),
        amountInCents = if_not_exists(amountInCents, :amount),
        #reference = if_not_exists(#reference, :reference),
        #status = if_not_exists(#status, :status),
        createdAt = if_not_exists(createdAt, :now),
        updatedAt = if_not_exists(updatedAt, :now),
        gsi1pk = if_not_exists(gsi1pk, :gsi1pk),
        gsi1sk = if_not_exists(gsi1sk, :gsi1sk),
        gsi2pk = if_not_exists(gsi2pk, :gsi2pk),
        gsi2sk = if_not_exists(gsi2sk, :gsi2sk)`,
      ExpressionAttributeNames: {
        "#reference": "reference",
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":email": email,
        ":amount": amountInCents,
        ":reference": reference,
        ":status": status || "PENDING",
        ":now": now,
        ":gsi1pk": `EMAIL#${email}`,
        ":gsi1sk": `TS#${now}`,
        ":gsi2pk": `DATE#${day}`,
        ":gsi2sk": `SALE#${transactionId}`,
      },
    })
  );
}

export async function getSale(transactionId) {
  const out = await doc.send(
    new GetCommand({
      TableName: table(),
      Key: saleKeys(transactionId),
    })
  );
  return out.Item ?? null;
}

export async function updateSaleStatus(transactionId, attrs) {
  const names = {};
  const values = {};
  const sets = ["#u = :u"];
  names["#u"] = "updatedAt";
  values[":u"] = new Date().toISOString();

  for (const [k, v] of Object.entries(attrs)) {
    names[`#${k}`] = k;
    values[`:${k}`] = v;
    sets.push(`#${k} = :${k}`);
  }

  await doc.send(
    new UpdateCommand({
      TableName: table(),
      Key: saleKeys(transactionId),
      UpdateExpression: `SET ${sets.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    })
  );
}

export async function markApprovedIfNew({
  transactionId,
  email,
  amountInCents,
  reference,
  code,
  counter,
  createdAt,
}) {
  const now = new Date().toISOString();
  const day = now.slice(0, 10);

  try {
    await doc.send(
      new UpdateCommand({
        TableName: table(),
        Key: saleKeys(transactionId),
        ConditionExpression: "attribute_not_exists(#code)",
        UpdateExpression:
          "SET #status = :approved, #code = :code, #counter = :counter, #email = if_not_exists(#email, :email), amountInCents = if_not_exists(amountInCents, :amount), #reference = if_not_exists(#reference, :reference), paidAt = :paid, updatedAt = :paid, createdAt = if_not_exists(createdAt, :created), gsi1pk = if_not_exists(gsi1pk, :gsi1pk), gsi1sk = if_not_exists(gsi1sk, :gsi1sk), gsi2pk = if_not_exists(gsi2pk, :gsi2pk), gsi2sk = if_not_exists(gsi2sk, :gsi2sk)",
        ExpressionAttributeNames: {
          "#code": "code",
          "#status": "status",
          "#counter": "counter",
          "#email": "customerEmail",
          "#reference": "reference",
        },
        ExpressionAttributeValues: {
          ":approved": "APPROVED",
          ":code": code,
          ":counter": counter,
          ":email": email,
          ":amount": amountInCents,
          ":reference": reference,
          ":paid": now,
          ":created": createdAt ?? now,
          ":gsi1pk": `EMAIL#${email}`,
          ":gsi1sk": `TS#${createdAt ?? now}`,
          ":gsi2pk": `DATE#${day}`,
          ":gsi2sk": `SALE#${transactionId}`,
        },
      })
    );
    return true;
  } catch (err) {
    if (err?.name === "ConditionalCheckFailedException") return false;
    throw err;
  }
}

export async function nextHotpCounter() {
  // Primer valor = 0, igual que el store JSON del prototipo (parte de -1 e incrementa).
  const out = await doc.send(
    new UpdateCommand({
      TableName: table(),
      Key: { pk: "COUNTER", sk: "HOTP" },
      UpdateExpression: "SET #v = if_not_exists(#v, :start) + :one",
      ExpressionAttributeNames: { "#v": "value" },
      ExpressionAttributeValues: { ":start": -1, ":one": 1 },
      ReturnValues: "UPDATED_NEW",
    })
  );
  return out.Attributes.value;
}
