import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface ProjectOptions {
  projectName: string;
  language: "ts" | "js";
  template: "counter" | "todo";
  useRouter: boolean;
  useTailwind: boolean;
  initGit: boolean;
}

export async function createProject(options: ProjectOptions) {
  const { projectName, language, template, useRouter, useTailwind, initGit } =
    options;

  const projectPath = path.resolve(process.cwd(), projectName);

  // Check if directory already exists
  if (await fs.pathExists(projectPath)) {
    throw new Error(`Directory "${projectName}" already exists`);
  }

  // Create project directory
  await fs.ensureDir(projectPath);

  // Copy template files from templates/<template>/<language>
  const templateDir = path.join(
    __dirname,
    "../templates",
    template,
    language === "ts" ? "ts" : "js"
  );
  if (!(await fs.pathExists(templateDir))) {
    throw new Error(
      `Template not found at ${templateDir}. Ensure templates/${template}/${language} exists.`
    );
  }
  await fs.copy(templateDir, projectPath);

  // Generate package.json
  const packageJson = generatePackageJson(
    projectName,
    language,
    useRouter,
    useTailwind
  );
  await fs.writeFile(
    path.join(projectPath, "package.json"),
    JSON.stringify(packageJson, null, 2)
  );

  // Generate vite.config
  const viteConfig = generateViteConfig(useTailwind);
  const viteConfigPath = path.join(
    projectPath,
    `vite.config.${language === "ts" ? "ts" : "js"}`
  );
  await fs.writeFile(viteConfigPath, viteConfig);

  // Generate tsconfig.json if TypeScript
  if (language === "ts") {
    const tsconfig = generateTsConfig();
    await fs.writeFile(
      path.join(projectPath, "tsconfig.json"),
      JSON.stringify(tsconfig, null, 2)
    );
  }

  // Ensure index.html points to correct main file
  await ensureIndexHtmlScript(projectPath, language);

  // Setup router if requested
  if (useRouter) {
    await setupRouter(projectPath, language);
  }

  // Setup Tailwind if requested
  if (useTailwind) {
    await setupTailwind(projectPath);
  }

  // Create .gitignore
  await createGitIgnore(projectPath);

  // Initialize git repository
  if (initGit) {
    await initializeGit(projectPath);
  }
}

function generatePackageJson(
  projectName: string,
  language: "ts" | "js",
  useRouter: boolean,
  useTailwind: boolean
) {
  return {
    name: projectName,
    private: true,
    version: "0.0.0",
    type: "module",
    scripts: {
      dev: "vite",
      build: "vite build",
      preview: "vite preview",
    },
    dependencies: {
      "@shadow-js/core": "^0.1.0",
      ...(useRouter && { "@shadow-js/router": "^0.1.0" }),
      ...(useTailwind && {
        "@tailwindcss/vite": "^4.1.12",
        tailwindcss: "^4.1.12",
      }),
    },
    devDependencies: {
      "@shadow-js/vite": "^0.3.0",
      vite: "^5.1.4",
      ...(language === "ts" && { typescript: "^5.5.4" }),
    },
  };
}

function generateViteConfig(useTailwind: boolean) {
  const lines = [
    'import { defineConfig } from "vite";',
    'import shadow from "@shadow-js/vite";',
    ...(useTailwind ? ['import tailwindcss from "@tailwindcss/vite";'] : []),
  ];

  const plugins = useTailwind ? "[shadow(), tailwindcss()]" : "[shadow()]";

  return `${lines.join("\n")}

export default defineConfig({
  plugins: ${plugins},
  server: {
    port: 3000,
  },
});
`;
}

function generateTsConfig() {
  return {
    compilerOptions: {
      target: "ES2020",
      useDefineForClassFields: true,
      lib: ["ES2020", "DOM", "DOM.Iterable"],
      module: "ESNext",
      skipLibCheck: true,
      moduleResolution: "bundler",
      allowImportingTsExtensions: true,
      resolveJsonModule: true,
      isolatedModules: true,
      noEmit: true,
      jsx: "preserve",
      jsxImportSource: "@shadow-js/core",
      strict: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
      noFallthroughCasesInSwitch: true,
    },
    include: ["src/**/*"],
  };
}

async function ensureIndexHtmlScript(
  projectPath: string,
  language: "ts" | "js"
) {
  const htmlFile = path.join(projectPath, "index.html");
  if (await fs.pathExists(htmlFile)) {
    let htmlContent = await fs.readFile(htmlFile, "utf-8");
    htmlContent = htmlContent.replace(
      /\/src\/main\.(t|j)sx/g,
      `/src/main.${language === "ts" ? "tsx" : "jsx"}`
    );
    await fs.writeFile(htmlFile, htmlContent);
  }
}

async function createGitIgnore(projectPath: string) {
  const gitignore = `dist
node_modules
.env
.env.local
.env.development.local
.env.test.local
.env.production.local
*.log
.DS_Store
.vite
`;

  await fs.writeFile(path.join(projectPath, ".gitignore"), gitignore);
}

async function initializeGit(projectPath: string) {
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);

  try {
    await execAsync("git init", { cwd: projectPath });
    await execAsync("git add .", { cwd: projectPath });
    await execAsync('git commit -m "Initial commit"', { cwd: projectPath });
  } catch (error) {
    console.warn("Failed to initialize git repository:", error);
  }
}

async function setupRouter(projectPath: string, language: "ts" | "js") {
  const srcDir = path.join(projectPath, "src");
  const mainFile = path.join(
    srcDir,
    `main.${language === "ts" ? "tsx" : "jsx"}`
  );

  const routerMainContent = `import { render } from "@shadow-js/core";
import { Route, Router } from "@shadow-js/router";
import App from "./App";
import "./style.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element not found");
}

render(
  <Router>
    <Route component={App} path="/" />
  </Router>,
  root
);`;

  await fs.writeFile(mainFile, routerMainContent);
}

/**
 * Tailwind setup:
 * - Look for `tailwind.css` in the template folder
 * - Replace `style.css` with its content
 */
async function setupTailwind(projectPath: string) {
  const srcDir = path.join(projectPath, "src");
  const stylePath = path.join(srcDir, "style.css");
  const tailwindFile = path.join(srcDir, "tailwind.css");

  if (await fs.pathExists(tailwindFile)) {
    const tailwindContent = await fs.readFile(tailwindFile, "utf-8");
    await fs.writeFile(stylePath, tailwindContent); // overwrite style.css
    await fs.remove(tailwindFile); // cleanup
  } else {
    console.warn(
      `⚠️ Tailwind file not found: ${tailwindFile}. Using default style.css.`
    );
  }
}

export { generatePackageJson, generateViteConfig, generateTsConfig };
