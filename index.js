const Express = require('express');
const SERVER_PORT = 3000;

const App = Express();

App.use(Express.text());

App.listen(SERVER_PORT, () => console.log(`Listening on port ${SERVER_PORT}`));