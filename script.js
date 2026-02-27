// ==========================
// Supabase configuration
// ==========================

// IMPORTANT: Replace these with your Supabase Project URL and anon public key
const SUPABASE_URL = "https://csbpbxpmwmqvdjllsbtx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzYnBieHBtd21xdmRqbGxzYnR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNjQ3OTAsImV4cCI6MjA4Nzc0MDc5MH0.w4coDbFhEJ1nCM5J9427Q2z1-X7z_WsY55CQHf2l-JQ";

// Create a single Supabase client for the whole app
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ==========================
// State
// ==========================

let currentUser = null;
let todos = [];
let currentFilter = "all"; // "all" | "active" | "completed"

// ==========================
// DOM elements
// ==========================

const authSection = document.getElementById("auth-section");
const authMessage = document.getElementById("auth-message");

const loginForm = document.getElementById("login-form");
const loginEmailInput = document.getElementById("login-email");
const loginPasswordInput = document.getElementById("login-password");

const signupForm = document.getElementById("signup-form");
const signupEmailInput = document.getElementById("signup-email");
const signupPasswordInput = document.getElementById("signup-password");

const tabButtons = document.querySelectorAll(".tab-button");

const todoSection = document.getElementById("todo-section");
const userEmailSpan = document.getElementById("user-email");
const logoutBtn = document.getElementById("logout-btn");
const todoForm = document.getElementById("todo-form");
const newTodoInput = document.getElementById("new-todo-input");
const todoList = document.getElementById("todo-list");
const todoMessage = document.getElementById("todo-message");
const filterButtons = document.querySelectorAll(".filter-btn");

// ==========================
// Utility helpers
// ==========================

function setAuthMessage(text, type = "") {
  authMessage.textContent = text;
  authMessage.classList.remove("error", "success");
  if (type) authMessage.classList.add(type);
}

function setTodoMessage(text, type = "") {
  todoMessage.textContent = text;
  todoMessage.classList.remove("error", "success");
  if (type) todoMessage.classList.add(type);
}

function formatDate(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  return d.toLocaleString();
}

// Show the correct UI depending on login state
function updateViewForAuth() {
  if (currentUser) {
    authSection.classList.add("hidden");
    todoSection.classList.remove("hidden");
    userEmailSpan.textContent = currentUser.email ?? "";
  } else {
    authSection.classList.remove("hidden");
    todoSection.classList.add("hidden");
    userEmailSpan.textContent = "";
    todos = [];
    renderTodos();
  }
}

// ==========================
// Auth logic
// ==========================

async function handleLogin(event) {
  event.preventDefault();
  const email = loginEmailInput.value.trim();
  const password = loginPasswordInput.value;

  if (!email || !password) return;

  setAuthMessage("Logging in...", "success");

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    currentUser = data.user;
    setAuthMessage("Logged in successfully!", "success");
    updateViewForAuth();
    await loadTodos();
  } catch (err) {
    console.error(err);
    setAuthMessage(err.message ?? "Login failed", "error");
  }
}

async function handleSignup(event) {
  event.preventDefault();
  const email = signupEmailInput.value.trim();
  const password = signupPasswordInput.value;

  if (!email || !password) return;

  setAuthMessage("Creating account...", "success");

  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
    });

    if (error) throw error;

    // Depending on your email confirmation settings, user may need to confirm first.
    setAuthMessage(
      "Account created! Check your email to confirm (if required), then log in.",
      "success"
    );
  } catch (err) {
    console.error(err);
    setAuthMessage(err.message ?? "Sign up failed", "error");
  }
}

async function handleLogout() {
  try {
    await supabaseClient.auth.signOut();
  } catch (err) {
    console.error(err);
  } finally {
    currentUser = null;
    updateViewForAuth();
    setAuthMessage("You have logged out.");
  }
}

// Try to restore an existing logged-in session on page load
async function restoreSession() {
  const { data, error } = await supabaseClient.auth.getUser();
  if (error) {
    console.warn("Error checking auth state:", error.message);
    return;
  }
  if (data.user) {
    currentUser = data.user;
    updateViewForAuth();
    await loadTodos();
  }
}

// Listen for auth changes (optional but keeps state in sync)
supabaseClient.auth.onAuthStateChange((_event, session) => {
  currentUser = session?.user ?? null;
  updateViewForAuth();
  if (currentUser) {
    loadTodos();
  } else {
    todos = [];
    renderTodos();
  }
});

// ==========================
// Todo logic
// ==========================

async function loadTodos() {
  if (!currentUser) return;
  setTodoMessage("Loading todos...");
  const { data, error } = await supabaseClient
    .from("todos")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    setTodoMessage(error.message ?? "Failed to load todos", "error");
    return;
  }

  todos = data || [];
  renderTodos();
  setTodoMessage("");
}

// Insert a new todo for the logged-in user
async function addTodo(task) {
  if (!currentUser) return;

  const newTodo = {
    user_id: currentUser.id, // RLS also enforces this
    task,
  };

  const { data, error } = await supabaseClient
    .from("todos")
    .insert(newTodo)
    .select()
    .single();

  if (error) throw error;

  // Add to local state and re-render
  todos.unshift(data);
  renderTodos(true); // animate on add
}

// Toggle completion flag
async function toggleTodoCompletion(id, currentValue) {
  const { data, error } = await supabaseClient
    .from("todos")
    .update({ is_completed: !currentValue })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;

  // Update local state
  todos = todos.map((t) => (t.id === id ? data : t));
  renderTodos();
}

// Delete todo
async function deleteTodo(id) {
  const { error } = await supabaseClient.from("todos").delete().eq("id", id);
  if (error) throw error;

  todos = todos.filter((t) => t.id !== id);
  renderTodos();
}

// ==========================
// Rendering
// ==========================

function getFilteredTodos() {
  if (currentFilter === "active") {
    return todos.filter((t) => !t.is_completed);
  }
  if (currentFilter === "completed") {
    return todos.filter((t) => t.is_completed);
  }
  return todos;
}

// Render todos into the list, with simple enter animation for new items
function renderTodos(animateNew = false) {
  const list = getFilteredTodos();

  todoList.innerHTML = "";

  if (!list.length) {
    todoList.innerHTML = "";
    setTodoMessage("No todos to show.");
    return;
  } else {
    setTodoMessage("");
  }

  list.forEach((todo) => {
    const li = document.createElement("li");
    li.className = "todo-item";
    if (animateNew) {
      // Start animation a tick later so transition can run
      requestAnimationFrame(() => {
        li.classList.add("enter");
      });
    } else {
      li.classList.add("enter");
    }
    li.dataset.id = todo.id;

    const main = document.createElement("div");
    main.className = "todo-main";

    const topRow = document.createElement("div");
    topRow.className = "todo-top-row";

    const checkboxLabel = document.createElement("label");
    checkboxLabel.className = "todo-checkbox";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = todo.is_completed;

    const mark = document.createElement("span");
    mark.className = "todo-checkbox-mark";

    checkboxLabel.appendChild(checkbox);
    checkboxLabel.appendChild(mark);

    const taskSpan = document.createElement("span");
    taskSpan.className = "todo-task";
    if (todo.is_completed) {
      taskSpan.classList.add("completed");
    }
    taskSpan.textContent = todo.task;

    topRow.appendChild(checkboxLabel);
    topRow.appendChild(taskSpan);

    const dateSpan = document.createElement("span");
    dateSpan.className = "todo-date";
    dateSpan.textContent = `Created: ${formatDate(todo.created_at)}`;

    main.appendChild(topRow);
    main.appendChild(dateSpan);

    const actions = document.createElement("div");
    actions.className = "todo-actions";

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-btn";
    deleteBtn.textContent = "Delete";

    actions.appendChild(deleteBtn);

    li.appendChild(main);
    li.appendChild(actions);

    // Checkbox click
    checkbox.addEventListener("change", async () => {
      try {
        await toggleTodoCompletion(todo.id, todo.is_completed);
      } catch (err) {
        console.error(err);
        setTodoMessage(err.message ?? "Failed to update todo", "error");
      }
    });

    // Delete click
    deleteBtn.addEventListener("click", async () => {
      try {
        await deleteTodo(todo.id);
      } catch (err) {
        console.error(err);
        setTodoMessage(err.message ?? "Failed to delete todo", "error");
      }
    });

    todoList.appendChild(li);
  });
}

// ==========================
// Event wiring
// ==========================

function setupEventListeners() {
  // Auth forms
  loginForm.addEventListener("submit", handleLogin);
  signupForm.addEventListener("submit", handleSignup);
  logoutBtn.addEventListener("click", handleLogout);

  // Auth tabs
  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.tab;

      tabButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      document
        .querySelectorAll(".form")
        .forEach((form) => form.classList.remove("active"));

      const targetForm = document.getElementById(targetId);
      if (targetForm) targetForm.classList.add("active");

      setAuthMessage("");
    });
  });

  // Add new todo
  todoForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const task = newTodoInput.value.trim();
    if (!task) return;
    setTodoMessage("Adding todo...");

    try {
      await addTodo(task);
      newTodoInput.value = "";
      setTodoMessage("Todo added!", "success");
    } catch (err) {
      console.error(err);
      setTodoMessage(err.message ?? "Failed to add todo", "error");
    }
  });

  // Filter buttons
  filterButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      filterButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentFilter = btn.dataset.filter || "all";
      renderTodos();
    });
  });
}

// ==========================
// Init
// ==========================

document.addEventListener("DOMContentLoaded", async () => {
  setupEventListeners();
  await restoreSession();
});
