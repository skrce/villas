import { useEffect } from "react";
import { BrowserRouter } from "react-router-dom";
import {
  getSessionOwnerKey,
  installSessionEvents,
  useStaffSession,
} from "./api/session";
import { AuthReturn } from "./app/AuthViews";
import Workspace from "./app/Workspace";
import "./App.css";
export default function App() {
  useStaffSession();
  useEffect(installSessionEvents, []);
  if (["/auth/start", "/auth/complete"].includes(window.location.pathname))
    return <AuthReturn />;
  return (
    <BrowserRouter>
      <Workspace key={getSessionOwnerKey()} />
    </BrowserRouter>
  );
}
