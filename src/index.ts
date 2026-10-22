export { type ParsedArgs, parseArgs } from "./args";
export {
  applyLocal,
  FRAMEWORK_REQUIRES,
  fileSpec,
  type LocalResult,
  localState,
  overrideField,
  overridesFor,
  parseManifest,
  tarballName,
} from "./local";
export {
  candidateName,
  isValidPackageName,
  type PathApi,
  packageNameProblem,
  resolveTarget,
  safeJoin,
  toPackageName,
  UsageError,
} from "./names";
export {
  ADDONS,
  type AddonInfo,
  type AddonName,
  enabledAddons,
  type LocalManifest,
  type LocalPack,
  PACKAGE_MANAGERS,
  type PackageManager,
  type PackedPackage,
  type ResolvedOptions,
  resolveOptions,
  type ScaffoldOptions,
  TEMPLATES,
  type TemplateName,
} from "./options";
export { buildProject, type Project, projectFiles } from "./project";
export { type ScaffoldResult, scaffold } from "./scaffold";
export {
  FRAMEWORK_PACKAGES,
  FRAMEWORK_RANGE,
  THIRD_PARTY_VERSIONS,
  VERSIONS,
  versionOf,
} from "./versions";
export { inspectTarget, type TargetState, type WriteResult, writeProject } from "./writer";
