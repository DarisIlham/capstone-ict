import { BrowserRouter as Router, Routes, Route, } from "react-router-dom";
import FimEvents from '../src/pages/FimEvents.jsx';

function App() {
  return (
    <div>
      <Router>
        <Routes>
          <Route path="/" element={<FimEvents />} />
        </Routes>
      </Router>
    </div>
  );
}
export default App;