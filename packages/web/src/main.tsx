import { StrictMode, useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { Link } from "./pages/Link";

function Router() {
  const [hash, setHash] = useState(window.location.hash);

  useEffect(() => {
    const handleHashChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  // Route based on hash
  if (hash === "#link") {
    return <Link />;
  }

  return <App />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Router />
  </StrictMode>
);
