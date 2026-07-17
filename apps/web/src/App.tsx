import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { Layout } from "./Layout";
import { Home } from "./pages/Home";
import { Login } from "./pages/Login";
import { Signup } from "./pages/Signup";
import { MarketPage } from "./pages/MarketPage";
import { Profile } from "./pages/Profile";
import { AdminLayout } from "./admin/AdminLayout";
import { AdminMarkets } from "./admin/AdminMarkets";
import { AdminMarketNew } from "./admin/AdminMarketNew";
import { AdminMarketDetail } from "./admin/AdminMarketDetail";
import { AdminCandidates } from "./admin/AdminCandidates";
import { AdminSponsors } from "./admin/AdminSponsors";
import { AdminSuspicious } from "./admin/AdminSuspicious";

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/entrar", element: <Login /> },
      { path: "/cadastro", element: <Signup /> },
      { path: "/m/:slug", element: <MarketPage /> },
      { path: "/perfil", element: <Profile /> },
      {
        path: "/admin",
        element: <AdminLayout />,
        children: [
          { index: true, element: <AdminMarkets /> },
          { path: "mercados", element: <AdminMarkets /> },
          { path: "mercados/novo", element: <AdminMarketNew /> },
          { path: "mercados/:slug", element: <AdminMarketDetail /> },
          { path: "candidatos", element: <AdminCandidates /> },
          { path: "patrocinadores", element: <AdminSponsors /> },
          { path: "suspeitas", element: <AdminSuspicious /> },
        ],
      },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
