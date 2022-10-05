import { useState } from "react";

import { RestCache, Provider } from "react-rest-cache";

import "./App.css";
import { Search } from "./components/Search";
import { Trips } from "./components/Trips";

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
