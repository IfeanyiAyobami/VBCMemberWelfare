// Test-only Node resolver for the app's extensionless relative TypeScript imports.
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (
      error.code === "ERR_MODULE_NOT_FOUND" &&
      specifier.startsWith(".") &&
      !/\.[a-z]+$/i.test(specifier)
    )
      return nextResolve(specifier + ".ts", context);
    throw error;
  }
}
