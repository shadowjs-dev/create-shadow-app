# create-shadow-app

[![npm version](https://img.shields.io/npm/v/create-shadow-app.svg)](https://www.npmjs.com/package/create-shadow-app)
[![Build Status](https://github.com/shadowjs-dev/shadow/workflows/CI/badge.svg)](https://github.com/shadowjs-dev/shadow/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)

Create ShadowJS apps with one command! This CLI tool helps you bootstrap new ShadowJS projects with Vite and TypeScript or JavaScript.

> ⚡ **Fast** • 🎯 **Type-Safe** • 📦 **Zero Config** • 🎨 **Modern**

## ✨ Features

- 🚀 **Instant Setup**: Create projects in seconds with Vite
- 🎯 **TypeScript Ready**: Full TypeScript support with strict configuration
- 📱 **Multiple Templates**: Choose from 2 starter templates
- ⚡ **Zero Config**: Works out of the box with sensible defaults
- 🛣️ **Router Support**: Built-in client-side routing with ShadowJS Router
- 📚 **Git Integration**: Automatic git repository initialization
- 🧪 **Well Tested**: Comprehensive test suite with Vitest
- 🔒 **Security First**: Regular security audits and dependency updates

## Templates

### Counter

A simple counter app with interactive buttons - perfect for learning ShadowJS basics.

### Todo App

An interactive task management application with full CRUD operations.

## 📋 Requirements

- **Node.js**: 20.0.0 or higher
- **npm**: 8.0.0 or higher (usually comes with Node.js)

## 🚀 Installation & Usage

### Quick Start

```bash
# Using npx (recommended)
npx create-shadow-app my-app

# Using npm
npm create shadow-app my-app

# Using yarn
yarn create shadow-app my-app

# Using pnpm
pnpm create shadow-app my-app
```

### Global Installation

```bash
# Install globally
npm install -g create-shadow-app

# Use the CLI
create-shadow-app my-app
```

## Interactive Setup

The CLI will guide you through the setup process:

1. **Project Name**: Enter the name of your project
2. **Language**: Choose between TypeScript or JavaScript
3. **Template**: Select one of the available templates
4. **Git Repository**: Choose whether to initialize a git repository
5. **Router**: Choose whether to add ShadowJS Router for client-side routing

## Project Structure

After setup, your project will have this structure:

```
my-app/
├── index.html
├── package.json
├── vite.config.js (or vite.config.ts if TypeScript selected)
├── tsconfig.json (if TypeScript selected)
└── src/
    ├── main.jsx (or main.tsx if TypeScript selected)
    ├── App.jsx (or App.tsx if TypeScript selected)
    ├── style.css
    └── vite-env.d.ts (if TypeScript selected)
```

## Getting Started

After creating your project:

```bash
cd my-app
npm install
npm run dev
```

Your app will be running at `http://localhost:3000`

## Features

### Git Integration

When you choose to initialize a git repository, the CLI will:

- Run `git init` in your project directory
- Add all project files to git
- Create an initial commit with the message "Initial commit"

### Router Integration

When you choose to add ShadowJS Router, the CLI will:

- Add `@shadow-js/router` as a dependency
- Set up a simple router configuration in `main.jsx` (or `main.tsx` if TypeScript selected)
- Create a route for the root path (`/`) that renders your App component
- Update the App component to work with the router

This provides a foundation for building multi-page applications with client-side routing.

## 🛠️ Development

### Local Development

```bash
# Clone the repository
git clone https://github.com/shadowjs-dev/shadow.git
cd shadow/packages/create-shadow-app

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Start development mode
npm run dev
```

### Available Scripts

- `npm run build` - Build the project
- `npm run dev` - Build in watch mode
- `npm run test` - Run test suite
- `npm run test:coverage` - Run tests with coverage
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues
- `npm run format` - Format code with Prettier
- `npm run typecheck` - Run TypeScript type checking

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details on:

- 🐛 Reporting bugs
- ✨ Requesting features
- 🛠️ Setting up a development environment
- 📝 Code style and standards
- 🧪 Testing guidelines
- 📄 Documentation standards

### Contributors

<a href="https://github.com/shadowjs-dev/shadow/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=shadowjs-dev/shadow" />
</a>

## 📚 Documentation

- 📖 [ShadowJS Documentation](https://shadowjs.dev)
- 🏗️ [Vite Documentation](https://vitejs.dev/)
- 📝 [Contributing Guide](CONTRIBUTING.md)
- 📋 [Changelog](CHANGELOG.md)

## 🆘 Support

- 📧 **Email**: support@shadowjs.dev
- 💬 **Discussions**: [GitHub Discussions](https://github.com/shadowjs-dev/shadow/discussions)
- 🐛 **Issues**: [GitHub Issues](https://github.com/shadowjs-dev/shadow/issues)
- 📖 **Documentation**: [ShadowJS Docs](https://shadowjs.dev)

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

Built with ❤️ by Jehaad AL-Johani for the ShadowJS ecosystem.

## ⭐ Show Your Support

If you find this project helpful, please give it a star on GitHub! It helps others discover the project and motivates continued development.

[![GitHub stars](https://img.shields.io/github/stars/shadowjs-dev/shadow?style=social)](https://github.com/shadowjs-dev/shadow)
