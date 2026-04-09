import { readFileSync } from 'node:fs';

import type { HttpMethod, RelayOperation } from './types.js';

interface OpenApiSpec {
  paths: Record<string, Record<string, Record<string, unknown>>>;
}

type JsonSchema = {
  type?: string;
  description?: string;
  enum?: string[];
  required?: string[];
  properties?: Record<string, JsonSchema>;
};

let cachedOperations: RelayOperation[] | undefined;

function loadSpec(): OpenApiSpec {
  const fileUrl = new URL('../relay-openapi.json', import.meta.url);
  return JSON.parse(readFileSync(fileUrl, 'utf8')) as OpenApiSpec;
}

function toMethod(value: string): HttpMethod {
  return value.toUpperCase() as HttpMethod;
}

function extractParameters(operation: Record<string, unknown>) {
  const rawParameters = (operation.parameters as Array<Record<string, unknown>> | undefined) ?? [];

  return rawParameters.map((parameter) => {
    const schema = (parameter.schema as JsonSchema | undefined) ?? {};
    return {
      name: String(parameter.name),
      location: parameter.in as 'path' | 'query' | 'header',
      required: Boolean(parameter.required),
      description: schema.description ?? (parameter.description as string | undefined),
      type: schema.type,
      enumValues: schema.enum
    };
  });
}

function extractBodyProperties(operation: Record<string, unknown>) {
  const schema = (((operation.requestBody as Record<string, unknown> | undefined)?.content as Record<
    string,
    Record<string, unknown>
  > | undefined)?.['application/json']?.schema ?? {}) as JsonSchema;
  const required = new Set(schema.required ?? []);
  const properties = schema.properties ?? {};

  return Object.entries(properties).map(([name, property]) => ({
    name,
    required: required.has(name),
    description: property.description,
    type: property.type,
    enumValues: property.enum
  }));
}

export function getOperations(): RelayOperation[] {
  if (cachedOperations) {
    return cachedOperations;
  }

  const spec = loadSpec();
  const operations: RelayOperation[] = [];

  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, rawOperation] of Object.entries(methods)) {
      const operation = rawOperation as Record<string, unknown>;
      operations.push({
        method: toMethod(method),
        path,
        description: operation.description as string | undefined,
        deprecated: Boolean(operation.deprecated),
        hidden: Boolean(operation['x-hidden']),
        parameters: extractParameters(operation),
        bodyProperties: extractBodyProperties(operation)
      });
    }
  }

  cachedOperations = operations.sort((left, right) =>
    `${left.method} ${left.path}`.localeCompare(`${right.method} ${right.path}`)
  );

  return cachedOperations;
}

export function findOperation(
  method: string,
  path: string
): RelayOperation | undefined {
  const normalizedMethod = method.toUpperCase();
  return getOperations().find(
    (operation) =>
      operation.method === normalizedMethod && operation.path === path
  );
}

export function searchOperations(term?: string): RelayOperation[] {
  if (!term) {
    return getOperations();
  }

  const normalized = term.toLowerCase();
  return getOperations().filter((operation) => {
    const description = operation.description ?? '';
    return (
      operation.path.toLowerCase().includes(normalized) ||
      operation.method.toLowerCase().includes(normalized) ||
      description.toLowerCase().includes(normalized)
    );
  });
}

export function interpolatePath(
  pathTemplate: string,
  pathParams: Record<string, string>
): string {
  return pathTemplate.replace(/\{([^}]+)\}/g, (_, token: string) => {
    const value = pathParams[token];
    if (!value) {
      throw new Error(`Missing path parameter: ${token}`);
    }

    return encodeURIComponent(value);
  });
}

export function parseKeyValueEntries(entries: string[]): Record<string, unknown> {
  return Object.fromEntries(
    entries.map((entry) => {
      const separatorIndex = entry.indexOf('=');
      if (separatorIndex === -1) {
        throw new Error(
          `Expected key=value format but received "${entry}".`
        );
      }

      const key = entry.slice(0, separatorIndex);
      const rawValue = entry.slice(separatorIndex + 1);
      return [key, coerceValue(rawValue)];
    })
  );
}

function coerceValue(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed === 'true') {
    return true;
  }

  if (trimmed === 'false') {
    return false;
  }

  if (trimmed === 'null') {
    return null;
  }

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    return JSON.parse(trimmed);
  }

  return value;
}
