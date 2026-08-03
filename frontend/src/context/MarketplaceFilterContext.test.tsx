import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MarketplaceFilterProvider } from "./MarketplaceFilterContext";
import { useMarketplaceFilter } from "@/hooks/useMarketplaceFilter";

function Probe() {
  const { marketplace, setMarketplace } = useMarketplaceFilter();
  return (
    <div>
      <span>value={marketplace}</span>
      <button onClick={() => setMarketplace("AMAZON_IT")}>set IT</button>
    </div>
  );
}

describe("MarketplaceFilterProvider", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to 'all'", () => {
    render(<MarketplaceFilterProvider><Probe /></MarketplaceFilterProvider>);
    expect(screen.getByText("value=all")).toBeInTheDocument();
  });

  it("updates and persists when setMarketplace is called", () => {
    render(<MarketplaceFilterProvider><Probe /></MarketplaceFilterProvider>);
    fireEvent.click(screen.getByText("set IT"));
    expect(screen.getByText("value=AMAZON_IT")).toBeInTheDocument();
    expect(window.localStorage.getItem("wbdash:marketplaceFilter")).toBe("AMAZON_IT");
  });

  it("throws when useMarketplaceFilter is used outside the provider", () => {
    const BadProbe = () => { useMarketplaceFilter(); return null; };
    expect(() => render(<BadProbe />)).toThrow();
  });

  it("adopts a pre-existing stored value asynchronously, after mount — not synchronously in initial render", async () => {
    // Guards against a real hydration-mismatch bug found via manual browser
    // testing: reading localStorage synchronously in useState's initializer
    // makes the client's very first render differ from Next.js' SSR pass
    // (which always sees no localStorage), so it must only ever change post-mount.
    window.localStorage.setItem("wbdash:marketplaceFilter", "AMAZON_IT");
    render(<MarketplaceFilterProvider><Probe /></MarketplaceFilterProvider>);
    await waitFor(() => expect(screen.getByText("value=AMAZON_IT")).toBeInTheDocument());
  });
});
