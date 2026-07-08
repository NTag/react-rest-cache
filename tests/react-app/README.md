# Testing react-rest-cache in a React app

A small Vite app with a mock API (see `vite.config.js`) exercising `useQuery`,
`useMutation` and the cache synchronization between components: fetching
`/api/search` or posting to `/api/users` returns an updated version of
`trip1`, and both `Trips` components re-render with the new name.

From the library root:

```bash
npm install
npm run build
cd tests/react-app/
npm install
npm run dev
```
