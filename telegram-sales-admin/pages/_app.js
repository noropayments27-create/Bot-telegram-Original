import { useRouter } from "next/router";

import Layout from "../components/Layout";
import "../styles/globals.css";

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const useLayout = router.pathname !== "/login";

  if (!useLayout) {
    return <Component {...pageProps} />;
  }

  return (
    <Layout>
      <Component {...pageProps} />
    </Layout>
  );
}
