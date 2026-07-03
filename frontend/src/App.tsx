import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./pages/Layout";
import { LandingPage } from "./pages/LandingPage";
import { FollowingPage } from "./pages/FollowingPage";
import { BrowsePage } from "./pages/BrowsePage";
import { EventPage } from "./pages/EventPage";
import { ScreenerPage } from "./pages/ScreenerPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<LandingPage />} />
          <Route path="following" element={<FollowingPage />} />
          <Route path="browse" element={<BrowsePage />} />
          <Route path="event/:slug" element={<EventPage />} />
          <Route path="screener" element={<ScreenerPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
