import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { Layout } from "./Layout";
import { Home } from "./pages/Home";
import { Login } from "./pages/Login";
import { Signup } from "./pages/Signup";
import { RequestPasswordReset } from "./pages/RequestPasswordReset";
import { ResetPassword } from "./pages/ResetPassword";
import { Termos } from "./pages/Termos";
import { MarketPage } from "./pages/MarketPage";
import { Profile } from "./pages/Profile";
import { SponsorPanel } from "./pages/SponsorPanel";
import { AdminLayout } from "./admin/AdminLayout";
import { AdminMarkets } from "./admin/AdminMarkets";
import { AdminMarketNew } from "./admin/AdminMarketNew";
import { AdminMarketDetail } from "./admin/AdminMarketDetail";
import { AdminCandidates } from "./admin/AdminCandidates";
import { AdminSponsors } from "./admin/AdminSponsors";
import { AdminEmailSettings } from "./admin/AdminEmailSettings";
import { AdminSuspicious } from "./admin/AdminSuspicious";

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/entrar", element: <Login /> },
      { path: "/cadastro", element: <Signup /> },
      { path: "/esqueci-senha", element: <RequestPasswordReset /> },
      { path: "/redefinir-senha", element: <ResetPassword /> },
      { path: "/termos", element: <Termos /> },
      { path: "/m/:slug", element: <MarketPage /> },
      { path: "/perfil", element: <Profile /> },
      { path: "/patrocinador", element: <SponsorPanel /> },
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
          { path: "email", element: <AdminEmailSettings /> },
          { path: "suspeitas", element: <AdminSuspicious /> },
        ],
      },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
