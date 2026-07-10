import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { Layout } from "./Layout";
import { Home } from "./pages/Home";
import { Login } from "./pages/Login";
import { Signup } from "./pages/Signup";
import { MarketPage } from "./pages/MarketPage";

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/entrar", element: <Login /> },
      { path: "/cadastro", element: <Signup /> },
      { path: "/m/:slug", element: <MarketPage /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
