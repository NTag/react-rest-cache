module.exports = function (app) {
  app.get("/api/trips", (req, res) => {
    res.send([
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
  });

  app.get("/api/search", (req, res) => {
    res.send({
      __typename: "Search",
      id: "search1",
      trip: {
        id: "trip1",
        __typename: "Trip",
        name: "Trip 1 — Updated",
        duration: "3 hours",
      },
    });
  });

  app.post("/api/users", (req, res) => {
    res.send({
      __typename: "User",
      id: "user1",
      name: "User 1",
      trips: [
        {
          id: "trip1",
          __typename: "Trip",
          name: `Trip updated - ${req.body}`,
          duration: "3 hours",
        },
      ],
    });
  });
};
