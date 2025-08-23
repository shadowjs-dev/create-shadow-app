#!/usr/bin/env node
import inquirer from "inquirer";
import chalk from "chalk";
import { createProject } from "./createProject";

const templates = [
  {
    name: "Counter - Simple counter app with interactive buttons",
    value: "counter",
  },
  {
    name: "Todo App - Interactive task management application",
    value: "todo",
  },
];

async function main() {
  console.log(chalk.bold.blue("🚀 Welcome to ShadowJS App Creator!\n"));

  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "projectName",
      message: "What is the name of your project?",
      default: "my-shadow-app",
      validate: (input: string) => {
        if (!input.trim()) {
          return "Project name cannot be empty";
        }
        return true;
      },
    },
    {
      type: "list",
      name: "language",
      message: "Select your preferred language:",
      choices: [
        { name: "TypeScript", value: "ts" },
        { name: "JavaScript", value: "js" },
      ],
    },
    {
      type: "list",
      name: "template",
      message: "Choose a template to get started:",
      choices: templates,
    },
    {
      type: "confirm",
      name: "useRouter",
      message: "Would you like to add client-side routing?",
      default: false,
    },
    {
      type: "confirm",
      name: "useTailwind",
      message: "Would you like to use Tailwind CSS?",
      default: false,
    },
    {
      type: "confirm",
      name: "initGit",
      message: "Initialize a git repository?",
      default: false,
    },
  ]);

  const { projectName, language, template, useRouter, useTailwind, initGit } =
    answers as {
      projectName: string;
      language: "ts" | "js";
      template: "counter" | "todo";
      useRouter: boolean;
      useTailwind: boolean;
      initGit: boolean;
    };

  console.log(
    chalk.green(
      `\n✨ Creating your ${language.toUpperCase()} ShadowJS app with:`
    )
  );
  console.log(`   📁 Project: ${chalk.cyan(projectName)}`);
  console.log(`   🔧 Template: ${chalk.cyan(template)}`);
  console.log(`   🛣️ Router: ${chalk.cyan(useRouter ? "Yes" : "No")}`);
  console.log(`   🎨 Tailwind: ${chalk.cyan(useTailwind ? "Yes" : "No")}`);
  console.log(`   📚 Git: ${chalk.cyan(initGit ? "Yes" : "No")}\n`);

  try {
    await createProject({
      projectName,
      language,
      template,
      useRouter,
      useTailwind,
      initGit,
    });

    console.log(
      chalk.bold.green("\n🎉 Success! Your ShadowJS app has been created!\n")
    );
    console.log(chalk.yellow("Next steps:"));
    console.log(`  1. ${chalk.cyan(`cd ${projectName}`)}`);
    console.log(`  2. ${chalk.cyan("npm install")}`);
    console.log(`  3. ${chalk.cyan("npm run dev")}`);
    console.log(
      chalk.yellow(`\n📖 Visit https://shadowjs.dev for documentation\n`)
    );
  } catch (error) {
    console.error(chalk.red("\n❌ Error creating project:"), error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(chalk.red("Unexpected error:"), error);
  process.exit(1);
});
