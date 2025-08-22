# Contributing to create-shadow-app

[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Discord](https://img.shields.io/badge/Discord-ShadowJS-blue)](https://discord.gg/shadowjs)

Thanks for your interest in contributing to `create-shadow-app`! We're excited to have you join our community of developers building tools for the ShadowJS ecosystem.

## 📋 Prerequisites

- **Node.js**: >= 20.0.0 (LTS recommended)
- **npm**: >= 9.0.0
- **Git**: >= 2.30.0
- **TypeScript**: >= 5.5.0 (for development)

## 🚀 Getting Started

### 1. Fork and Clone

```bash
# Fork the repository on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/create-shadow-app.git
cd create-shadow-app
```

### 2. Install Dependencies

```bash
npm ci  # Use npm ci for reproducible builds
```

### 3. Set Up Development Environment

```bash
# Build the CLI
npm run build

# Run type checking
npm run typecheck

# Run linting
npm run lint

# Format code
npm run format
```

### 4. Test Your Setup

```bash
# Test the CLI
npm run start
```

## 📁 Project Structure

```
create-shadow-app/
├── src/                    # CLI source code
│   ├── index.ts           # CLI entry point
│   ├── createProject.ts   # Project scaffolding logic
│   └── createProject.test.ts # Tests
├── templates/             # Project templates
│   ├── empty/            # Basic template
│   ├── blog/             # Blog template
│   ├── todo/             # Todo app template
├── .github/              # GitHub configuration
│   ├── workflows/        # CI/CD workflows
│   └── dependabot.yml    # Dependency updates
└── dist/                 # Built output
```

## 🔧 Making Changes

### Code Style Guidelines

- **TypeScript**: Use strict TypeScript with proper type annotations
- **Formatting**: Prettier (`.prettierrc`)
- **Linting**: ESLint (`eslint.config.mjs`)
- **Imports**: Use ES6 imports, consolidate imports from same package
- **Naming**: Use camelCase for variables/functions, PascalCase for types
- **Documentation**: Add JSDoc comments for all public functions

### Development Workflow

1. **Create a feature branch**:

   ```bash
   git checkout -b feature/amazing-feature
   # or for bug fixes
   git checkout -b fix/bug-description
   ```

2. **Make your changes**:
   - Write tests for new functionality
   - Update documentation
   - Ensure type safety

3. **Test your changes**:

   ```bash
   # Run tests
   npm run test

   # Build CLI
   npm run build

   # Type check
   npm run typecheck

   # Lint
   npm run lint
   ```

4. **Commit your changes**:

   ```bash
   git add .
   git commit -m "feat: add amazing feature"
   ```

### Template Development

When adding new templates:

1. **Create template structure** in `templates/your-template/`
2. **Update** `src/createProject.ts` to handle your template
3. **Add tests** for the new template
4. **Update documentation** in README.md

## 📦 Versioning and Releasing

### Proposing a Release

1. **Test thoroughly**:

   ```bash
   npm run test
   npm run build
   npm run typecheck
   npm run lint
   ```

2. **Update version** in `package.json`

3. **Update changelog** in `CHANGELOG.md`

4. **Commit changes**:

   ```bash
   git add .
   git commit -m "chore: prepare release v1.2.3"
   git tag v1.2.3
   git push origin main --tags
   ```

### Release Process

- **Automated**: GitHub Actions handles publishing
- **Semantic**: Follows [Semantic Versioning](https://semver.org/)
- **Changelog**: Manually maintained in `CHANGELOG.md`

## 🧪 Testing

### Running Tests

```bash
# All tests
npm run test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

### Writing Tests

- Use Vitest for testing
- Follow existing patterns in `src/createProject.test.ts`
- Test both happy path and error cases
- Mock file system operations

### CLI Testing

Test the CLI interactively:

```bash
npm run start
```

## 📚 Documentation

### Adding Documentation

- Update JSDoc comments for new functions
- Add examples to README.md
- Update template documentation
- Ensure TypeScript types are well-documented

### Documentation Guidelines

- Use clear, concise language
- Include practical examples
- Document template features
- Keep CLI usage up-to-date

## 🤝 Pull Request Process

### PR Requirements

- ✅ **Tests**: Add tests for new functionality
- ✅ **Documentation**: Update relevant docs
- ✅ **TypeScript**: Ensure type safety
- ✅ **Linting**: Pass all lint checks
- ✅ **Build**: Successfully build CLI

### PR Template

Please use this template when opening PRs:

```markdown
## Description

Brief description of the changes.

## Changes

- What was changed
- Why it was changed
- How it was changed

## Testing

- How to test the changes
- What was tested
- Edge cases considered

## Breaking Changes

- Are there any breaking changes?
- Migration guide if needed
```

### Code Review

- All PRs require at least one approval
- Address review comments promptly
- Keep PRs focused and small when possible
- Use draft PRs for work-in-progress

## 🐛 Reporting Bugs

### Bug Reports

Please use the GitHub issue template:

1. **Clear Title**: Summarize the issue
2. **Description**: Detailed explanation
3. **Reproduction**: Steps to reproduce
4. **Environment**: Node.js version, OS, etc.
5. **Expected vs Actual**: What should happen vs what happens

### Feature Requests

Use the feature request template:

1. **Problem**: What problem does this solve?
2. **Solution**: Describe the proposed solution
3. **Alternatives**: Any alternative solutions?
4. **Use Cases**: Specific use cases for templates

## 🔒 Security Issues

### Reporting Security Issues

- **Email**: security@shadowjs.dev
- **GitHub**: Open a private security advisory
- **DO NOT** open public issues for security vulnerabilities

### Security Best Practices

- Follow secure coding guidelines
- Use dependency scanning tools
- Keep dependencies updated
- Review code for security issues

## 🎯 Code of Conduct

Please read and follow our [Code of Conduct](./CODE_OF_CONDUCT.md).

## 📞 Getting Help

- **Discord**: Join our community on Discord
- **GitHub Discussions**: Ask questions and share ideas
- **Issues**: For bug reports and feature requests

## 🙏 Acknowledgments

We appreciate all contributions, whether they're:

- Code contributions
- Bug reports
- Feature requests
- Documentation improvements
- Template suggestions
- Community support

Every contribution makes `create-shadow-app` better for everyone! 🚀
