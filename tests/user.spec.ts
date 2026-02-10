import { test, expect } from 'playwright-test-coverage';
import { Page } from 'playwright';
import { User, Role } from '../src/service/pizzaService';

async function basicInit(page: Page) {
    let loggedInUser: User | undefined;
    const validUsers: Record<string, User> = {
        'a@jwt.com': {
            id: '1',
            name: '常用名字',
            email: 'a@jwt.com',
            password: 'admin',
            roles: [{ role: Role.Admin }],
        },
        'f@jwt.com': {
            id: '2',
            name: 'Franchise Admin',
            email: 'f@jwt.com',
            password: 'franchise',
            roles: [{ role: Role.Franchisee }],
        },
    };

    await page.route('*/**/api/auth', async (route) => {
        const method = route.request().method();

        // Logout
        if (method === 'DELETE') {
            loggedInUser = undefined;
            await route.fulfill({ json: { message: 'logout successful' } });
            return;
        }

        // Register
        if (method === 'POST') {
            const req = route.request().postDataJSON();
            if (req.name) {
                // This is a register request (has name field)
                // Generate a unique ID for the new user
                const maxId = Math.max(
                    ...Object.values(validUsers).map(u => parseInt(u.id || '0'))
                );
                const newId = (maxId + 1).toString();

                const newUser = {
                    id: newId,
                    name: req.name,
                    email: req.email,
                    password: req.password,
                    roles: [{ role: Role.Diner }],
                };
                validUsers[req.email] = { ...newUser };
                await route.fulfill({
                    json: {
                        user: newUser,
                        token: 'mock-jwt-token',
                    },
                });
                return;
            }
        }

        // Login
        const loginReq = route.request().postDataJSON();
        const user = validUsers[loginReq.email];
        if (!user || user.password !== loginReq.password) {
            await route.fulfill({ status: 401, json: { error: 'Unauthorized' } });
            return;
        }
        loggedInUser = validUsers[loginReq.email];
        const loginRes = {
            user: loggedInUser,
            token: 'abcdef',
        };
        await route.fulfill({ json: loginRes });
    });

    // Return the currently logged in user
    await page.route('*/**/api/user/me', async (route) => {
        if (route.request().method() === 'GET') {
            await route.fulfill({ json: loggedInUser });
        } else {
            await route.continue();
        }
    });

    // Update user endpoint
    await page.route('**/api/user/**', async (route) => {
        if (route.request().method() === 'PUT') {
            const req = route.request().postDataJSON();
            const url = new URL(route.request().url());
            const pathSegments = url.pathname.split('/');
            const userId = pathSegments[pathSegments.length - 1];

            // Find user by id and update
            let found = false;
            for (const email in validUsers) {
                if (validUsers[email].id === userId) {
                    found = true;
                    let userKey = email;

                    // If email is changing, update the key in validUsers
                    if (req.email && req.email !== email) {
                        validUsers[req.email] = validUsers[email];
                        userKey = req.email;
                        delete validUsers[email];
                    }

                    // Update all fields that were provided
                    if (req.name) validUsers[userKey].name = req.name;
                    if (req.email) validUsers[userKey].email = req.email;
                    if (req.password) validUsers[userKey].password = req.password;

                    // Update logged in user to reflect changes
                    if (loggedInUser) {
                        if (req.name) loggedInUser.name = req.name;
                        if (req.email) loggedInUser.email = req.email;
                    }

                    const updatedUser: User = {
                        id: validUsers[userKey].id,
                        name: validUsers[userKey].name,
                        email: validUsers[userKey].email,
                        roles: validUsers[userKey].roles,
                    };

                    await route.fulfill({
                        status: 200,
                        json: {
                            user: updatedUser,
                            token: 'mock-jwt-token-updated',
                        },
                    });
                    return;
                }
            }
            if (!found) {
                await route.fulfill({ status: 404, json: { error: 'User not found' } });
            }
        } else {
            await route.continue();
        }
    });

    await page.goto('/');
}

test('update user name works and persists', async ({ page }) => {
    await basicInit(page);
    const email = `user${Math.floor(Math.random() * 10000)}@jwt.com`;

    await page.getByRole('link', { name: 'Register' }).click();
    await page.getByRole('textbox', { name: 'Full name' }).fill('pizza diner');
    await page.getByRole('textbox', { name: 'Email address' }).fill(email);
    await page.getByRole('textbox', { name: 'Password' }).fill('diner');
    await page.getByRole('button', { name: 'Register' }).click();

    await page.getByRole('link', { name: 'pd' }).click();

    await page.getByRole('button', { name: 'Edit' }).click();
    await expect(page.locator('h3')).toContainText('Edit user');
    await page.getByRole('textbox').first().fill('pizza dinerx');
    await page.getByRole('button', { name: 'Update' }).click();

    // Wait a moment for the update to process
    await page.waitForTimeout(1000);

    // Click somewhere else to ensure dialog closes
    await page.getByRole('button', { name: 'Logout' }).click();
    await page.getByRole('link', { name: 'Login' }).click();

    await page.getByRole('textbox', { name: 'Email address' }).fill(email);
    await page.getByRole('textbox', { name: 'Password' }).fill('diner');
    await page.getByRole('button', { name: 'Login' }).click();

    await page.getByRole('link', { name: 'pd' }).click();

    await expect(page.getByRole('main')).toContainText('pizza dinerx');
});

test('update user email works and persists', async ({ page }) => {
    await basicInit(page);
    const email = `user${Math.floor(Math.random() * 10000)}@jwt.com`;

    await page.getByRole('link', { name: 'Register' }).click();
    await page.getByRole('textbox', { name: 'Full name' }).fill('pizza diner');
    await page.getByRole('textbox', { name: 'Email address' }).fill(email);
    await page.getByRole('textbox', { name: 'Password' }).fill('diner');
    await page.getByRole('button', { name: 'Register' }).click();

    await page.getByRole('link', { name: 'pd' }).click();

    await page.getByRole('button', { name: 'Edit' }).click();
    await expect(page.locator('h3')).toContainText('Edit user');
    const newEmail = `user${Math.floor(Math.random() * 10000)}@jwt.com`;
    await page.getByRole('textbox').nth(1).fill(newEmail);
    await page.getByRole('button', { name: 'Update' }).click();

    // Wait a moment for the update to process
    await page.waitForTimeout(1000);

    // Click somewhere else to ensure dialog closes
    await page.getByRole('button', { name: 'Logout' }).click();
    await page.getByRole('link', { name: 'Login' }).click();

    await page.getByRole('textbox', { name: 'Email address' }).fill(newEmail);
    await page.getByRole('textbox', { name: 'Password' }).fill('diner');
    await page.getByRole('button', { name: 'Login' }).click();

    await page.getByRole('link', { name: 'pd' }).click();

    await expect(page.getByRole('main')).toContainText(newEmail);
});

test('update user password works and persists', async ({ page }) => {
    await basicInit(page);
    const email = `user${Math.floor(Math.random() * 10000)}@jwt.com`;

    await page.getByRole('link', { name: 'Register' }).click();
    await page.getByRole('textbox', { name: 'Full name' }).fill('pizza diner');
    await page.getByRole('textbox', { name: 'Email address' }).fill(email);
    await page.getByRole('textbox', { name: 'Password' }).fill('diner');
    await page.getByRole('button', { name: 'Register' }).click();

    await page.getByRole('link', { name: 'pd' }).click();

    await page.getByRole('button', { name: 'Edit' }).click();
    await expect(page.locator('h3')).toContainText('Edit user');
    await page.getByRole('textbox').nth(2).fill('dinerx');
    await page.getByRole('button', { name: 'Update' }).click();

    // Wait a moment for the update to process
    await page.waitForTimeout(1000);

    // Click somewhere else to ensure dialog closes
    await page.getByRole('button', { name: 'Logout' }).click();
    await page.getByRole('link', { name: 'Login' }).click();

    await page.getByRole('textbox', { name: 'Email address' }).fill(email);
    await page.getByRole('textbox', { name: 'Password' }).fill('dinerx');
    await page.getByRole('button', { name: 'Login' }).click();

    await page.getByRole('link', { name: 'pd' }).click();

    await expect(page.getByRole('main')).toContainText(email);
});

test('admin user can update profile', async ({ page }) => {
    await basicInit(page);

    await page.getByRole('link', { name: 'Login' }).click();
    await page.getByRole('textbox', { name: 'Email address' }).fill('a@jwt.com');
    await page.getByRole('textbox', { name: 'Password' }).fill('admin');
    await page.getByRole('button', { name: 'Login' }).click();

    // Click on the user profile link in header
    await page.locator('a[href="/diner-dashboard"]').click();

    await page.getByRole('button', { name: 'Edit' }).click();
    await expect(page.locator('h3')).toContainText('Edit user');
    await page.getByRole('textbox').first().fill('Updated Admin Name');
    await page.getByRole('button', { name: 'Update' }).click();

    // Wait for update
    await page.waitForTimeout(1000);

    // Logout to verify persistence
    await page.getByRole('button', { name: 'Logout' }).click();
    await page.getByRole('link', { name: 'Login' }).click();

    await page.getByRole('textbox', { name: 'Email address' }).fill('a@jwt.com');
    await page.getByRole('textbox', { name: 'Password' }).fill('admin');
    await page.getByRole('button', { name: 'Login' }).click();

    await page.locator('a[href="/diner-dashboard"]').click();

    // Verify the name persisted
    await expect(page.getByRole('main')).toContainText('Updated Admin Name');
});

test('franchisee user can update profile', async ({ page }) => {
    await basicInit(page);

    await page.getByRole('link', { name: 'Login' }).click();
    await page.getByRole('textbox', { name: 'Email address' }).fill('f@jwt.com');
    await page.getByRole('textbox', { name: 'Password' }).fill('franchise');
    await page.getByRole('button', { name: 'Login' }).click();

    // Click on the user profile link in header
    await page.locator('a[href="/diner-dashboard"]').click();

    await page.getByRole('button', { name: 'Edit' }).click();
    await expect(page.locator('h3')).toContainText('Edit user');
    await page.getByRole('textbox').first().fill('Updated Franchisee Name');
    await page.getByRole('button', { name: 'Update' }).click();

    // Wait for update
    await page.waitForTimeout(1000);

    // Logout to verify persistence
    await page.getByRole('button', { name: 'Logout' }).click();
    await page.getByRole('link', { name: 'Login' }).click();

    await page.getByRole('textbox', { name: 'Email address' }).fill('f@jwt.com');
    await page.getByRole('textbox', { name: 'Password' }).fill('franchise');
    await page.getByRole('button', { name: 'Login' }).click();

    await page.locator('a[href="/diner-dashboard"]').click();

    // Verify the name persisted
    await expect(page.getByRole('main')).toContainText('Updated Franchisee Name');
});
