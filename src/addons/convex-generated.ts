/**
 * The files `npx convex dev` writes to `convex/_generated`, as they look for a project with a
 * schema and one module (`tasks`). They are written into new projects so that the app builds and
 * type-checks before the first `convex dev`; Convex overwrites them with the real ones, which also
 * list every module you add. Source: the codegen templates of `convex` 1.46.
 */

const HEADER = (title: string): string => `/* eslint-disable */
/**
 * ${title}
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run \`convex dev\`.
 * @module
 */
`;

const API_JS = `${HEADER("Generated `api` utility.")}
import { anyApi } from "convex/server";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * \`\`\`js
 * const myFunctionReference = api.myModule.myFunction;
 * \`\`\`
 */
export const api = anyApi;
export const internal = anyApi;
`;

const API_DTS = `${HEADER("Generated `api` utility.")}
import type { ApiFromModules, FilterApi, FunctionReference } from "convex/server";
import type * as tasks from "../tasks.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * \`\`\`js
 * const myFunctionReference = api.myModule.myFunction;
 * \`\`\`
 */
declare const fullApi: ApiFromModules<{
  tasks: typeof tasks;
}>;
export declare const api: FilterApi<typeof fullApi, FunctionReference<any, "public">>;
export declare const internal: FilterApi<typeof fullApi, FunctionReference<any, "internal">>;
`;

const DATA_MODEL_DTS = `${HEADER("Generated data model types.")}
import type {
  DataModelFromSchemaDefinition,
  DocumentByName,
  SystemTableNames,
  TableNamesInDataModel,
} from "convex/server";
import type { GenericId } from "convex/values";
import schema from "../schema.js";

/** The names of all of your Convex tables. */
export type TableNames = TableNamesInDataModel<DataModel>;

/** The type of a document stored in Convex. */
export type Doc<TableName extends TableNames> = DocumentByName<DataModel, TableName>;

/** An identifier for a document in Convex. */
export type Id<TableName extends TableNames | SystemTableNames> = GenericId<TableName>;

/** A type describing your Convex data model. */
export type DataModel = DataModelFromSchemaDefinition<typeof schema>;
`;

const SERVER_JS = `${HEADER("Generated utilities for implementing server-side Convex query and mutation functions.")}
import {
  actionGeneric,
  httpActionGeneric,
  internalActionGeneric,
  internalMutationGeneric,
  internalQueryGeneric,
  mutationGeneric,
  queryGeneric,
} from "convex/server";

/** Define a query in this Convex app's public API. */
export const query = queryGeneric;

/** Define a query that is only accessible from other Convex functions. */
export const internalQuery = internalQueryGeneric;

/** Define a mutation in this Convex app's public API. */
export const mutation = mutationGeneric;

/** Define a mutation that is only accessible from other Convex functions. */
export const internalMutation = internalMutationGeneric;

/** Define an action in this Convex app's public API. */
export const action = actionGeneric;

/** Define an action that is only accessible from other Convex functions. */
export const internalAction = internalActionGeneric;

/** Define an HTTP action. */
export const httpAction = httpActionGeneric;
`;

const SERVER_DTS = `${HEADER("Generated utilities for implementing server-side Convex query and mutation functions.")}
import type {
  ActionBuilder,
  GenericActionCtx,
  GenericDatabaseReader,
  GenericDatabaseWriter,
  GenericMutationCtx,
  GenericQueryCtx,
  HttpActionBuilder,
  MutationBuilder,
  QueryBuilder,
} from "convex/server";
import type { DataModel } from "./dataModel.js";

/** Define a query in this Convex app's public API. */
export declare const query: QueryBuilder<DataModel, "public">;

/** Define a query that is only accessible from other Convex functions. */
export declare const internalQuery: QueryBuilder<DataModel, "internal">;

/** Define a mutation in this Convex app's public API. */
export declare const mutation: MutationBuilder<DataModel, "public">;

/** Define a mutation that is only accessible from other Convex functions. */
export declare const internalMutation: MutationBuilder<DataModel, "internal">;

/** Define an action in this Convex app's public API. */
export declare const action: ActionBuilder<DataModel, "public">;

/** Define an action that is only accessible from other Convex functions. */
export declare const internalAction: ActionBuilder<DataModel, "internal">;

/** Define an HTTP action. */
export declare const httpAction: HttpActionBuilder;

/** The context of a query function. */
export type QueryCtx = GenericQueryCtx<DataModel>;

/** The context of a mutation function. */
export type MutationCtx = GenericMutationCtx<DataModel>;

/** The context of an action function. */
export type ActionCtx = GenericActionCtx<DataModel>;

/** An interface to read from the database within query functions. */
export type DatabaseReader = GenericDatabaseReader<DataModel>;

/** An interface to read from and write to the database within mutation functions. */
export type DatabaseWriter = GenericDatabaseWriter<DataModel>;
`;

/** File name below `convex/_generated` to content. @since 1.0.0 */
export const CONVEX_GENERATED: Readonly<Record<string, string>> = Object.freeze({
  "api.js": API_JS,
  "api.d.ts": API_DTS,
  "dataModel.d.ts": DATA_MODEL_DTS,
  "server.js": SERVER_JS,
  "server.d.ts": SERVER_DTS,
});
