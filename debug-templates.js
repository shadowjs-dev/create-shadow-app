#!/usr/bin/env node

import fs from "fs-extra";
import path from "path";

async function debugTemplate(templateName) {
  console.log(`🔍 Debugging ${templateName} template...`);

  // Check template directory exists
  const templateDir = path.join(process.cwd(), "templates", templateName);
  const exists = await fs.pathExists(templateDir);
  console.log(`Template directory exists: ${exists}`);

  if (exists) {
    // List files in template directory
    const files = await fs.readdir(templateDir);
    console.log(`Files in ${templateName} template:`, files);

    // Check App.tsx content
    const appFile = path.join(templateDir, "src", "App.tsx");
    if (await fs.pathExists(appFile)) {
      const content = await fs.readFile(appFile, "utf-8");
      console.log(`App.tsx first 100 chars:`, content.substring(0, 100));

      // Check for specific content
      if (content.includes("Counter Example")) {
        console.log("🔢 Contains COUNTER content");
      }
      if (content.includes("interface Todo")) {
        console.log("📝 Contains TODO content");
      }
    } else {
      console.log("❌ App.tsx not found in template");
    }
  }

  console.log("---");
}

async function main() {
  await debugTemplate("counter");
  await debugTemplate("todo");
}

main().catch(console.error);
