import { test, expect } from "playwright-test-coverage";
import { Page } from "playwright";
import { Role, User } from "../src/service/pizzaService";

async function basicInit(page: Page) {
  let loggedInUser: User | undefined;
  const validUsers: Record<string, User> = {
    "d@jwt.com": {
      id: "3",
      name: "Kai Chen",
      email: "d@jwt.com",
      password: "a",
      roles: [{ role: Role.Diner }],
    },
    'a@jwt.com': {
      id: "1",
      name: "常用名字",
      email: "a@jwt.com",
      password: "admin",
      roles: [{ role: Role.Admin }],
    },
    'f@jwt.com': {
      id: "2",
      name: "Franchise Admin",
      email: "f@jwt.com",
      password: "franchise",
      roles: [{ role: Role.Franchisee }],
    }
  };

  // Create fresh copies for each test to avoid shared state issues
  const franchiseData = [
    {
      id: 2,
      name: "LotaPizza",
      admins: [{ email: "f@jwt.com", id: "2", name: "Franchise Admin" }],
      stores: [
        { id: 4, name: "Lehi" },
        { id: 5, name: "Springville" },
        { id: 6, name: "American Fork" },
      ],
    },
    { id: 3, name: "PizzaCorp", admins: [], stores: [{ id: 7, name: "Spanish Fork" }] },
    { id: 4, name: "topSpot", admins: [], stores: [] },
  ];
  const franchises: { franchises: typeof franchiseData } = {
    franchises: franchiseData,
  };

  // Authorize login/logout for the given user
  await page.route("*/**/api/auth", async (route) => {
    const method = route.request().method();

    // Logout
    if (method === "DELETE") {
      loggedInUser = undefined;
      await route.fulfill({ json: { message: "logout successful" } });
      return;
    }

    // Login
    const loginReq = route.request().postDataJSON();
    const user = validUsers[loginReq.email];
    if (!user || user.password !== loginReq.password) {
      await route.fulfill({ status: 401, json: { error: "Unauthorized" } });
      return;
    }
    loggedInUser = validUsers[loginReq.email];
    const loginRes = {
      user: loggedInUser,
      token: "abcdef",
    };
    await route.fulfill({ json: loginRes });
  });

  // Return the currently logged in user
  await page.route("*/**/api/user/me", async (route) => {
    expect(route.request().method()).toBe("GET");
    await route.fulfill({ json: loggedInUser });
  });

  // A standard menu
  await page.route("*/**/api/order/menu", async (route) => {
    const menuRes = [
      {
        id: 1,
        title: "Veggie",
        image: "pizza1.png",
        price: 0.0038,
        description: "A garden of delight",
      },
      {
        id: 2,
        title: "Pepperoni",
        image: "pizza2.png",
        price: 0.0042,
        description: "Spicy treat",
      },
    ];
    expect(route.request().method()).toBe("GET");
    await route.fulfill({ json: menuRes });
  });

  // ALL franchise-related routes in one handler
  await page.route(/\/api\/franchise/, async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;
    const method = route.request().method();

    // /api/franchise/:franchiseId/store/:storeId - DELETE store
    const storeDeleteMatch = pathname.match(/\/api\/franchise\/(\d+)\/store\/(\d+)$/);
    if (storeDeleteMatch && method === "DELETE") {
      const franchiseId = Number(storeDeleteMatch[1]);
      const storeId = Number(storeDeleteMatch[2]);
      const franchise = franchises.franchises.find((f) => f.id === franchiseId);
      if (franchise) {
        franchise.stores = franchise.stores.filter((store) => store.id !== storeId);
      }
      await route.fulfill({ json: { message: "store deleted" } });
      return;
    }

    // /api/franchise/:franchiseId/store - POST create store
    const storeCreateMatch = pathname.match(/\/api\/franchise\/(\d+)\/store$/);
    if (storeCreateMatch && method === "POST") {
      const franchiseId = Number(storeCreateMatch[1]);
      const franchise = franchises.franchises.find((f) => f.id === franchiseId);
      const req = route.request().postDataJSON();
      if (!franchise) {
        await route.fulfill({ status: 404, json: { message: "franchise not found" } });
        return;
      }
      const nextId = Math.max(0, ...franchise.stores.map((store) => store.id)) + 1;
      const newStore = { id: nextId, name: req.name };
      franchise.stores.push(newStore);
      await route.fulfill({ json: newStore });
      return;
    }

    // /api/franchise/:userId - GET franchises for user
    const userFranchiseMatch = pathname.match(/\/api\/franchise\/(\d+)$/);
    if (userFranchiseMatch && method === "GET") {
      const userId = userFranchiseMatch[1];
      const userFranchises = franchises.franchises.filter(f =>
        f.admins?.some(a => a.id === userId)
      );
      await route.fulfill({ json: userFranchises });
      return;
    }

    // /api/franchise/:franchiseId - DELETE franchise
    if (userFranchiseMatch && method === "DELETE") {
      const franchiseId = userFranchiseMatch[1];
      franchises.franchises = franchises.franchises.filter(f => String(f.id) !== franchiseId);
      await route.fulfill({ json: { message: "franchise deleted" } });
      return;
    }

    // /api/franchise or /api/franchise?... - GET list franchises
    if (pathname === "/api/franchise" && method === "GET") {
      await route.fulfill({ json: franchises });
      return;
    }

    // /api/franchise - POST create franchise
    if (pathname === "/api/franchise" && method === "POST") {
      const req = route.request().postDataJSON();
      const adminEmail = req.admins[0].email;
      const adminUser = validUsers[adminEmail];
      const newFranchise = {
        id: 5,
        name: req.name,
        admins: [{ email: adminEmail, id: adminUser?.id || "0", name: adminUser?.name || "Unknown" }],
        stores: [],
      };
      franchises.franchises.push(newFranchise);
      await route.fulfill({ json: newFranchise });
      return;
    }

    // Fallback - should not reach here
    await route.continue();
  });

  // Order endpoints - GET for history, POST to place order
  await page.route("*/**/api/order", async (route) => {
    const method = route.request().method();

    // GET orders (for diner dashboard)
    if (method === "GET") {
      await route.fulfill({ json: { dinpigeIng: [], orders: [], page: 1 } });
      return;
    }

    // POST to place an order
    const orderReq = route.request().postDataJSON();
    const orderRes = {
      order: { ...orderReq, id: 23 },
      jwt: "eyJpYXQ",
    };
    await route.fulfill({ json: orderRes });
  });

  await page.goto("/");
}

test("login profile and logout", async ({ page }) => {
  await basicInit(page);
  await page.getByRole("link", { name: "Login" }).click();
  await page.getByRole("textbox", { name: "Email address" }).fill("d@jwt.com");
  await page.getByRole("textbox", { name: "Password" }).fill("a");
  await page.getByRole("button", { name: "Login" }).click();

  await expect(page.getByRole("link", { name: "KC" })).toBeVisible();
  await page.getByRole("link", { name: "KC" }).click();
  await expect(page.getByRole('heading')).toContainText('Your pizza kitchen');

  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page.getByRole("link", { name: "Login" })).toBeVisible();
});

test("purchase with login", async ({ page }) => {
  await basicInit(page);

  // Go to order page
  await page.getByRole("button", { name: "Order now" }).click();

  // Create order
  await expect(page.locator("h2")).toContainText("Awesome is a click away");
  await page.getByRole("combobox").selectOption("4");
  await page.getByRole("link", { name: "Image Description Veggie A" }).click();
  await page.getByRole("link", { name: "Image Description Pepperoni" }).click();
  await expect(page.locator("form")).toContainText("Selected pizzas: 2");
  await page.getByRole("button", { name: "Checkout" }).click();

  // Login
  await page.getByPlaceholder("Email address").click();
  await page.getByPlaceholder("Email address").fill("d@jwt.com");
  await page.getByPlaceholder("Email address").press("Tab");
  await page.getByPlaceholder("Password").fill("a");
  await page.getByRole("button", { name: "Login" }).click();

  // Pay
  await expect(page.getByRole("main")).toContainText(
    "Send me those 2 pizzas right now!",
  );
  await expect(page.locator("tbody")).toContainText("Veggie");
  await expect(page.locator("tbody")).toContainText("Pepperoni");
  await expect(page.locator("tfoot")).toContainText("0.008 ₿");
  await page.getByRole("button", { name: "Pay now" }).click();

  // Check balance
  await expect(page.getByText("0.008")).toBeVisible();
});

test("create and delete franchise as admin", async ({ page }) => {
  await basicInit(page);

  await page.getByRole("link", { name: "Login" }).click();
  await page.getByRole("textbox", { name: "Email address" }).fill("a@jwt.com");
  await page.getByRole("textbox", { name: "Email address" }).press("Tab");
  await page.getByRole("textbox", { name: "Password" }).fill("admin");
  await page.getByRole("textbox", { name: "Password" }).press("Enter");

  await page.getByRole("link", { name: "Admin" }).click();
  await page.getByRole('button', { name: 'Add Franchise' }).click();
  await page.getByRole('textbox', { name: 'franchise name' }).click();
  await page.getByRole('textbox', { name: 'franchise name' }).fill('Provo');
  await page.getByRole('textbox', { name: 'franchisee admin email' }).click();
  await page.getByRole('textbox', { name: 'franchisee admin email' }).fill('f@jwt.com');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('table')).toContainText('Provo');

  await page.locator('tbody:nth-child(5) > .border-neutral-500 > .px-6 > .px-2').click();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('table')).not.toContainText('Provo');
});

test("franchisee can create and delete stores", async ({ page }) => {
  await basicInit(page);

  // Franchisee login
  await page.getByRole("link", { name: "Login" }).click();
  await page.getByRole("textbox", { name: "Email address" }).fill("f@jwt.com");
  await page.getByRole("textbox", { name: "Email address" }).press("Tab");
  await page.getByRole("textbox", { name: "Password" }).fill("franchise");
  await page.getByRole("textbox", { name: "Password" }).press("Enter");

  // Go to Franchisee dashboard
  await page.getByLabel('Global').getByRole('link', { name: 'Franchise' }).click();

  // Should see the franchise dashboard with LotaPizza
  await expect(page.locator("h2")).toContainText("LotaPizza");

  // Add a new store
  await page.getByRole("button", { name: "Create store" }).click();
  await page.getByPlaceholder("store name").fill("Orem");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("table")).toContainText("Orem");

  // Delete the store
  await page.getByRole("row", { name: /Orem/ }).getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("table")).not.toContainText("Orem");
});

test("about page", async ({ page }) => {
  await basicInit(page);
  await page.goto("/about");
  await expect(page.getByRole("heading", { name: "The secret sauce" })).toBeVisible();
  await expect(page.getByText("At JWT Pizza, our amazing employees")).toBeVisible();
});

test("history page", async ({ page }) => {
  await basicInit(page);
  await page.goto("/history");
  await expect(page.getByRole("heading")).toContainText("Mama Rucci, my my");
});

test("not found page", async ({ page }) => {
  await basicInit(page);
  await page.goto("/nonexistent-page-xyz");
  await expect(page.getByRole("heading")).toContainText("Oops");
});

test("register new user", async ({ page }) => {
  await basicInit(page);

  // Mock register endpoint
  await page.route("*/**/api/auth", async (route) => {
    if (route.request().method() === "POST") {
      const req = route.request().postDataJSON();
      if (req.name) {
        // This is a register request (has name field)
        const newUser = {
          user: {
            id: "10",
            name: req.name,
            email: req.email,
            roles: [{ role: "diner" }],
          },
          token: "newtoken123",
        };
        await route.fulfill({ json: newUser });
        return;
      }
    }
    await route.continue();
  }, { times: 1 });

  await page.getByRole("link", { name: "Register" }).click();
  await expect(page.getByRole("heading")).toContainText("Welcome to the party");

  await page.getByPlaceholder("Full name").fill("Test User");
  await page.getByPlaceholder("Email address").fill("test@example.com");
  await page.getByPlaceholder("Password").fill("password123");
  await page.getByRole("button", { name: "Register" }).click();

  // After register, user should be logged in
  await expect(page.getByRole("link", { name: "TU" })).toBeVisible();
});

test("docs page", async ({ page }) => {
  await basicInit(page);
  await page.goto("/docs/general");
  await expect(page.getByRole("heading", { name: "JWT Pizza API" })).toBeVisible();
  await expect(page.getByRole('main')).toContainText('service: http://localhost:3000');
  await expect(page.getByRole('main')).toContainText('factory: https://pizza-factory.cs329.click');
});
