# Shopify Order Splitter App

This Shopify app automatically splits sales orders containing a mix of pre-sale and regular items. When a draft order is paid, the app checks for items marked as "pre-sale" and splits them into separate orders based on a location code, while retaining regular items in the original order.

## Core Functionality

- **Monitors Orders**: Uses the `orders/create` webhook to monitor when draft orders are paid and converted to sales orders.
- **Checks for Pre-Sale Items**: Identifies items belonging to a fulfillment location that has a metafield `custom.pre_sale` set to `true`.
- **Splits Orders**: If an order contains both pre-sale and non-pre-sale items, it splits the pre-sale items into new orders. Each new order is grouped by a `custom.location_code` metafield on the product/variant.
- **Retains Orders**: If an order contains *only* pre-sale items or *no* pre-sale items, no split is performed.
- **Prevents Duplicates**: Tags processed orders with `split-processed` or `pre-sale-retained` to prevent processing the same order twice.
- **Admin UI**: Provides a settings page in the Shopify Admin to enable/disable splitting, map location codes to inventory locations, and view action logs.

## Technical Stack

- **Backend**: Node.js, Express.js, Remix
- **Frontend**: React, Shopify Polaris, Shopify App Bridge
- **Database**: Prisma with SQLite (for local development)
- **API**: Shopify Admin API (GraphQL)

---

## Setup and Installation

This app is built using the Shopify CLI.

### Prerequisites

- Node.js (LTS version)
- npm or yarn
- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli)
- A Shopify Partner account and a development store.

### Installation Steps

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd order-splitter-app
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Set up the database:**
    This command creates the SQLite database file and runs the necessary migrations.
    ```bash
    npx prisma migrate dev
    ```

4.  **Run the development server:**
    Start the app using the Shopify CLI. This will guide you through connecting the app to your development store.
    ```bash
    shopify app dev
    ```

    Follow the prompts from the CLI. It will update your `.env` file with the correct app credentials and provide you with a URL to install the app on your store.

---

## Configuration

For the app to work correctly, you need to configure metafields on your Shopify locations and products.

### 1. Mark a Location as "Pre-Sale"

The app identifies pre-sale items based on their assigned fulfillment location. You must add a metafield to each location that handles pre-sale inventory.

- **Go to:** Shopify Admin > Settings > Locations.
- **Select** the location you want to mark as pre-sale.
- **Scroll down** to Metafields and click "Add metafield".
- **Create a metafield** with the following properties:
    - **Namespace**: `custom`
    - **Key**: `pre_sale`
    - **Type**: `Boolean`
- **Set the value** to `true`.

### 2. Add Location Codes to Products

Each product variant that can be part of a split order needs a `location_code` metafield. This code is used to group items and assign the split order to the correct inventory location.

- **Go to:** Shopify Admin > Products.
- **Select** a product and then a variant.
- **Scroll down** to Metafields and click "Add metafield".
- **Create a metafield** with the following properties:
    - **Namespace**: `custom`
    - **Key**: `location_code`
    - **Type**: `Single-line text`
- **Set the value** to a unique code you will use to identify the location (e.g., `NY-WAREHOUSE`, `LA-DIST`).

### 3. Map Location Codes in the App

Once your metafields are set up, you need to map the codes to Shopify's actual inventory locations within the app itself.

- **Go to:** Shopify Admin > Apps > Order Splitter.
- **Navigate** to the "Settings" tab.
- In the "Location Mappings" section, enter the `location_code` you defined on your products and select the corresponding Shopify Location from the dropdown.
- Click "Add Mapping".

---

## Deployment

To deploy this app, you can use a service like Heroku or Vercel.

### General Steps:

1.  **Choose a hosting provider** that supports Node.js.
2.  **Set up a database**: For production, you should use a more robust database than SQLite (e.g., PostgreSQL, MySQL). Update the `datasource` in `prisma/schema.prisma` and your database connection URL environment variable.
3.  **Set Environment Variables**: On your hosting provider, set the following environment variables:
    - `SHOPIFY_API_KEY`
    - `SHOPIFY_API_SECRET`
    - `SCOPES`
    - `DATABASE_URL`
    - `HOST` (The public URL of your app)
4.  **Update Shopify App URLs**: In your Shopify Partner Dashboard, update the App URL and Allowed Redirection URL(s) to point to your production host URL.
5.  **Deploy**: Push your code to the hosting provider.

### Example (Heroku)

```bash
# Login to Heroku
heroku login

# Create a new Heroku app
heroku create your-app-name

# Add a database (e.g., Heroku Postgres)
heroku addons:create heroku-postgresql:hobby-dev

# Set environment variables (from your Partner dashboard and Heroku config)
heroku config:set SHOPIFY_API_KEY=...
heroku config:set SHOPIFY_API_SECRET=...
# ... and so on

# Push to deploy
git push heroku main

# Run database migrations on the server
heroku run npx prisma migrate deploy
```

---

## Testing

1.  **Set up** your locations and products with the required metafields in your development store.
2.  **Create a Draft Order** with a mix of pre-sale and non-pre-sale items.
3.  **Mark the draft order as paid** to convert it to a sales order. This will trigger the `orders/create` webhook.
4.  **Check the Logs**: Go to the app's admin page and view the "Logs" tab to see if the order was processed.
5.  **Verify Orders**: Check your Shopify Admin under "Orders" to confirm:
    - The original order was updated to only contain non-pre-sale items and is tagged `split-processed`.
    - A new order was created with the pre-sale items, a suffixed order number (e.g., `#1001-P1`), and is assigned to the correct location.