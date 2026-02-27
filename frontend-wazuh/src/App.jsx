import { BrowserRouter as Router, Routes, Route, } from "react-router-dom";
import FimEvents from '../src/pages/FimEvents.jsx';
import ThreadHuntingEvents from "./pages/ThreadHuntingEvents.jsx";

function App() {
  return (
    <div>
      <Router>
        <Routes>
          <Route path="/" element={<FimEvents />} />
          <Route path="/thread-hunting" element={<ThreadHuntingEvents />} />
        </Routes>
      </Router>
    </div>
  );
}
export default App;