## Testing react-rest-cache in a React app

Go in the directory of the library and then:

```bash
npm install
npm run build
rm -rf node_modules/ # This is important because if you don’t, due to a npm limitation on peer dependencies, launching the CRA app will fail
cd tests/react-app/
npm install
npm start
```
