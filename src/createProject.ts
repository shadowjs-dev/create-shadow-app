import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface ProjectOptions {
  projectName: string;
  language: "ts" | "js";
  template: "counter" | "todo";
  useRouter: boolean;
  initGit: boolean;
}

export async function createProject(options: ProjectOptions) {
  const { projectName, language, template, useRouter, initGit } = options;

  const projectPath = path.resolve(process.cwd(), projectName);

  // Check if directory already exists
  if (await fs.pathExists(projectPath)) {
    throw new Error(`Directory "${projectName}" already exists`);
  }

  // Create project directory
  await fs.ensureDir(projectPath);

  // Copy template files
  const templateDir = path.join(__dirname, "../templates", template);
  await fs.copy(templateDir, projectPath);

  // Generate package.json
  const packageJson = generatePackageJson(projectName, language, useRouter);
  await fs.writeFile(
    path.join(projectPath, "package.json"),
    JSON.stringify(packageJson, null, 2)
  );

  // Generate vite.config
  const viteConfig = generateViteConfig(language);
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

  // Update main files based on language
  await updateMainFiles(projectPath, language);

  // Setup router if requested
  if (useRouter) {
    await setupRouter(projectPath, language, template);
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
  useRouter: boolean
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
    },
    devDependencies: {
      "@shadow-js/vite": "^0.3.0",
      vite: "^5.1.4",
      ...(language === "ts" && { typescript: "^5.5.4" }),
    },
  };
}

function generateViteConfig(language: "ts" | "js") {
  const importStatement =
    language === "ts"
      ? 'import { defineConfig } from "vite";\nimport shadow from "@shadow-js/vite";'
      : 'import { defineConfig } from "vite";\nimport shadow from "@shadow-js/vite";';

  return `${importStatement}

export default defineConfig({
  plugins: [shadow()],
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

async function updateMainFiles(projectPath: string, language: "ts" | "js") {
  const srcDir = path.join(projectPath, "src");

  // Update HTML file to use correct extension
  const htmlFile = path.join(projectPath, "index.html");
  if (await fs.pathExists(htmlFile)) {
    let htmlContent = await fs.readFile(htmlFile, "utf-8");
    if (language === "js") {
      htmlContent = htmlContent.replace("/src/main.tsx", "/src/main.jsx");
    }
    await fs.writeFile(htmlFile, htmlContent);
  }

  // Rename main.tsx to main.js and App.tsx to App.js if JavaScript
  if (language === "js") {
    const tsMain = path.join(srcDir, "main.tsx");
    const jsMain = path.join(srcDir, "main.jsx");
    if (await fs.pathExists(tsMain)) {
      await fs.move(tsMain, jsMain);
      let content = await fs.readFile(jsMain, "utf-8");
      content = content.replace(/import .*\.tsx/g, (match) =>
        match.replace(".tsx", ".jsx")
      );
      await fs.writeFile(jsMain, content);
    }

    const tsApp = path.join(srcDir, "App.tsx");
    const jsApp = path.join(srcDir, "App.jsx");
    if (await fs.pathExists(tsApp)) {
      await fs.move(tsApp, jsApp);
      let content = await fs.readFile(jsApp, "utf-8");
      content = content.replace(/import .*\.tsx/g, (match) =>
        match.replace(".tsx", ".jsx")
      );
      await fs.writeFile(jsApp, content);
    }
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
    // Initialize git repository
    await execAsync("git init", { cwd: projectPath });

    // Add all files
    await execAsync("git add .", { cwd: projectPath });

    // Create initial commit
    await execAsync('git commit -m "Initial commit"', { cwd: projectPath });
  } catch (error) {
    console.warn("Failed to initialize git repository:", error);
  }
}

async function setupRouter(
  projectPath: string,
  language: "ts" | "js",
  template: "counter" | "todo"
) {
  const srcDir = path.join(projectPath, "src");
  const mainFile = path.join(
    srcDir,
    `main.${language === "ts" ? "tsx" : "jsx"}`
  );
  const appFile = path.join(srcDir, `App.${language === "ts" ? "tsx" : "jsx"}`);

  // Create a simple router setup
  const routerMainContent = `import { render } from "@shadow-js/core";
import { Route, Router } from "@shadow-js/router";
import App from "./App";

const root = document.getElementById("root")${language === "js" ? ";" : "!;"}
render(
  <Router>
    <Route component={App} path="/" />
  </Router>,
  root
);`;

  await fs.writeFile(mainFile, routerMainContent);

  // Update the App component to be simpler since it's now routed
  const appContent =
    language === "ts"
      ? `import { useStore } from "@shadow-js/core";
${template === "counter" ? 'import "./style.css";' : ""}

export default function App() {
  const [count, setCount] = useStore(0);

  return (
    <div class="app">
      <h1>ShadowJS App with Router</h1>
      <div class="counter">
        <button onClick={() => setCount((c) => c - 1)}>-</button>
        <span>{count()}</span>
        <button onClick={() => setCount((c) => c + 1)}>+</button>
      </div>
      <p>Router is enabled! You can add more routes as needed.</p>
    </div>
  );
}`
      : `import { useStore } from "@shadow-js/core";
${template === "counter" ? 'import "./style.css";' : ""}

export default function App() {
  const [count, setCount] = useStore(0);

  return (
    <div class="app">
      <h1>ShadowJS App with Router</h1>
      <div class="counter">
        <button onClick={() => setCount((c) => c - 1)}>-</button>
        <span>{count()}</span>
        <button onClick={() => setCount((c) => c + 1)}>+</button>
      </div>
      <p>Router is enabled! You can add more routes as needed.</p>
    </div>
  );
}`;

  await fs.writeFile(appFile, appContent);
}

// Export utility functions for testing
export { generatePackageJson, generateViteConfig, generateTsConfig };
