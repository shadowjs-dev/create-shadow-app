import { useStore } from "@shadow-js/core";

export default function App() {
  const [count, setCount] = useStore(0);

  return (
    <div class="container">
      <header>
        <h1>Welcome to ShadowJS</h1>
        <p>A reactive framework for building modern web applications</p>
      </header>

      <main>
        <div class="card">
          <h2>Counter Example</h2>
          <div class="counter">
            <button onClick={() => setCount((c) => c - 1)}>-</button>
            <span class="count">{count()}</span>
            <button onClick={() => setCount((c) => c + 1)}>+</button>
          </div>
          <p>Count: {count()}</p>
        </div>

        <div class="card">
          <h2>Features</h2>
          <ul>
            <li>⚡ Fast reactive updates</li>
            <li>🎯 TypeScript support</li>
            <li>📦 Zero-config bundling with Vite</li>
            <li>🛣️ Built-in router</li>
          </ul>
        </div>
      </main>

      <footer>
        <p>Built with ❤️ using ShadowJS</p>
      </footer>
    </div>
  );
}
