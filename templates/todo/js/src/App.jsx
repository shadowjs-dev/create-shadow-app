import { useStore, For } from "@shadow-js/core";

const [todos, setTodos] = useStore([
  {
    id: "1",
    text: "Learn ShadowJS",
    completed: false,
    createdAt: new Date(),
  },
  {
    id: "2",
    text: "Build a todo app",
    completed: true,
    createdAt: new Date(),
  },
  {
    id: "3",
    text: "Deploy to production",
    completed: false,
    createdAt: new Date(),
  },
]);

const [newTodo, setNewTodo] = useStore("");

let inputRef;

const addTodo = () => {
  if (newTodo().trim()) {
    const todo = {
      id: Date.now().toString(),
      text: newTodo().trim(),
      completed: false,
      createdAt: new Date(),
    };
    setTodos((todos) => [...todos, todo]);
    setNewTodo("");
    inputRef.value = "";
    inputRef.focus();
  }
};

const toggleTodo = (id) => {
  setTodos((todos) =>
    todos.map((todo) =>
      todo.id === id ? { ...todo, completed: !todo.completed } : todo
    )
  );
};

const deleteTodo = (id) => {
  setTodos((todos) => todos.filter((todo) => todo.id !== id));
};

function TodoItem({ todo }) {
  return (
    <div class="todo-item">
      <input
        type="checkbox"
        checked={todo.completed}
        onChange={() => toggleTodo(todo.id)}
      />
      <span class={todo.completed ? "completed" : ""}>{todo.text}</span>
      <button onClick={() => deleteTodo(todo.id)}>Delete</button>
    </div>
  );
}

export default function App() {
  return (
    <div class="container">
      <div class="todo-input">
        <input
          type="text"
          ref={inputRef}
          value={newTodo()}
          onInput={(e) => setNewTodo(e.target.value)}
          placeholder="What needs to be done?"
        />
        <button onClick={addTodo}>Add</button>
      </div>

      <div class="todo-list">
        <For each={todos().sort((a) => (a.completed ? 1 : -1))}>
          {(todo) => <TodoItem todo={todo} />}
        </For>

        {todos().length === 0 && (
          <div class="empty-state">No todos yet. Add one above!</div>
        )}
      </div>
    </div>
  );
}
