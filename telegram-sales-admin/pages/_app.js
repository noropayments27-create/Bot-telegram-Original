import { useRouter } from "next/router";

import Header from "../components/Header";
import "../styles/globals.css";

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const showHeader = router.pathname !== "/login";

  return (
    <>
      {showHeader && <Header />}
      <Component {...pageProps} />
    </>
  );
}
