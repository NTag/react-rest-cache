// Type tests for createTypedHooks, checked by `npm run typecheck` (tsc):
// each `@ts-expect-error` must be an error, everything else must compile.
import { createTypedHooks } from "./typed";

type Json<T> = { content: { "application/json": T } };

interface User {
  id: string;
  name: string;
}

// The shape openapi-typescript generates.
interface paths {
  "/api/users/": {
    get: {
      parameters: { query?: { search?: string } };
      responses: { 200: Json<User[]> };
    };
    post: {
      parameters: { query?: never };
      requestBody: Json<{ name: string }>;
      responses: { 201: Json<User> };
    };
    patch?: never;
  };
  "/api/avatars/": {
    post: {
      parameters: { query?: never };
      requestBody: {
        content: { "application/json": { file: string }; "multipart/form-data": { file: string } };
      };
      responses: { 201: Json<{ url: string }> };
    };
  };
  "/api/users/me/": {
    get: { parameters: { query?: never }; responses: { 200: Json<{ me: true }> } };
  };
  "/api/users/{id}/": {
    get: { parameters: { query?: never }; responses: { 200: Json<User> } };
    patch: {
      parameters: { query?: never };
      requestBody?: Json<{ name?: string }>;
      responses: { 200: Json<User> };
    };
    delete: {
      parameters: { query?: never };
      responses: { 204: { content?: never } };
    };
  };
  "/api/users/{id}/preview/": {
    get: { parameters: { query?: never }; responses: { 200: Json<{ preview: true }> } };
  };
  "/api/users/{user_id}/{post_id}/": {
    get: { parameters: { query?: never }; responses: { 200: Json<{ post: true }> } };
  };
  "/api/users/{user_id}/posts/": {
    get: { parameters: { query?: never }; responses: { 200: Json<{ title: string }[]> } };
  };
}

const { useQuery, useMutation } = createTypedHooks<paths, "/api/">();
declare const id: string;

export function Component() {
  // Responses follow the route.
  const users = useQuery("users/", { params: { search: "a" } });
  const names: string[] | undefined = users.data?.map((user) => user.name);

  const user = useQuery(`users/${id}/`);
  const name: string | undefined = user.data?.name;

  // A fixed segment wins over a parameter.
  const me = useQuery("users/me/");
  const isMe: true | undefined = me.data?.me;

  // {user_id} matches one segment: not users/{id}/.
  const posts = useQuery(`users/${id}/posts/`);
  const titles: string[] | undefined = posts.data?.map((post) => post.title);

  // A fixed segment wins anywhere in the path, not only for an exact path:
  // users/{user_id}/posts/ over users/{user_id}/{post_id}/.
  const userPosts = useQuery(`users/${id}/posts/`);
  const firstTitle: string | undefined = userPosts.data?.[0]?.title;
  const preview = useQuery(`users/${id}/preview/`);
  const isPreview: true | undefined = preview.data?.preview;

  // @ts-expect-error: no such route
  useQuery(`users/${id}/nope/now/`);

  // A union of paths gives the union of their responses.
  const either = useQuery(id ? (`users/${id}/` as const) : ("users/me/" as const));
  const either_: { me: true } | User | undefined = either.data;
  // @ts-expect-error: no such query parameter
  useQuery("users/", { params: { unknown: "a" } });
  // @ts-expect-error: a user has no `email`
  user.data?.email;

  // Mutations: the body and the response of the route and method.
  const [create] = useMutation("users/", { method: "POST" });
  create({ body: { name: "Ada" } }).then((created) => {
    if (created) {
      const createdId: string = created.id;
      void createdId;
    }
  });
  // @ts-expect-error: `name` must be a string
  create({ body: { name: 1 } });

  // The subPath completes the route.
  const [update] = useMutation("users/", { method: "PATCH" });
  update({ subPath: `${id}/`, body: { name: "Ada" } });
  // @ts-expect-error: unknown field
  update({ subPath: `${id}/`, body: { age: 3 } });

  // Multipart endpoints also take FormData; JSON-only ones don't.
  const [upload] = useMutation("avatars/", { method: "POST" });
  upload({ body: new FormData() });
  // @ts-expect-error: users/ takes JSON only
  create({ body: new FormData() });

  const [remove] = useMutation(`users/${id}/`, { method: "DELETE" });
  remove().then((nothing) => {
    const empty: void = nothing;
    void empty;
  });

  return [names, name, isMe, titles, firstTitle, isPreview, either_];
}
