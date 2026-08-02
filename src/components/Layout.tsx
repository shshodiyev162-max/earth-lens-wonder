import Navbar from "./Navbar";
import { Outlet } from "react-router-dom";

export default function Layout() {
  return (
    <>
      <Navbar />
      <main className="pt-16 min-h-screen bg-background relative">
        <Outlet />
      </main>
    </>
  );
}

