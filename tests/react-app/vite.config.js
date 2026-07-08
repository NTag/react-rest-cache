import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const json = (res, data) => {
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
};

// Mock API served by the Vite dev server (replaces CRA's setupProxy.js).
// The /search and /users responses return updated versions of trip1, to
// exercise the cache synchronization between components.
const mockApi = () => ({
  name: "mock-api",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const path = req.url.split("?")[0];

      if (req.method === "GET" && path === "/api/trips") {
        return json(res, [
          {
            id: "trip1",
            __typename: "Trip",
            name: "Trip 1",
            duration: "2 hours",
          },
          {
            id: "trip2",
            __typename: "Trip",
            name: "Trip 2",
            duration: "30 minutes",
          },
        ]);
      }

      if (req.method === "GET" && path === "/api/search") {
        return json(res, {
          __typename: "Search",
          id: "search1",
          trip: {
            id: "trip1",
            __typename: "Trip",
            name: "Trip 1 — Updated",
            duration: "3 hours",
          },
        });
      }

      if (req.method === "POST" && path === "/api/users") {
        return json(res, {
          __typename: "User",
          id: "user1",
          name: "User 1",
          trips: [
            {
              id: "trip1",
              __typename: "Trip",
              name: "Trip updated",
              duration: "3 hours",
            },
          ],
        });
      }

      next();
    });
  },
});

export default defineConfig({
  plugins: [react(), mockApi()],
  resolve: {
    // react-rest-cache is a linked file: dependency whose own node_modules
    // contains a copy of React; dedupe so the app and the library share one.
    dedupe: ["react", "react-dom"],
  },
});
