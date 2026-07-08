import "./App.css";

import { Provider, RestCache } from "react-rest-cache";

import { Search } from "./components/Search";
import { Trips } from "./components/Trips";
import { User } from "./components/User";
import { useState } from "react";

const restCache = RestCache({ baseUrl: "/api/" });

function App() {
  const [isSearchActive, setIsSearchActive] = useState(false);

  return (
    <Provider restCache={restCache}>
      <div className="Row">
        <div>
          Trips A: <Trips />
        </div>
        <div>
          Trips B: <Trips />
        </div>
      </div>
      <User />
      <div>
        <button onClick={() => setIsSearchActive((isActive) => !isActive)}>
          Toggle search
        </button>
        {isSearchActive ? <Search /> : null}
      </div>
    </Provider>
  );
}

export default App;
