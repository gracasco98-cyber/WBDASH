"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { api, AmazonProduct } from "@/lib/api";
import { isAmazonChannel, amazonChannelCode } from "@/components/dashboard/FilterBar";
import {
  ViewConfig, DEFAULT_CONFIG, ProductRow, ChannelGroup, ActiveSection,
  ALL_AMAZON_MPS,
} from "@/components/dashboard/cross-channel/crossChannelTypes";
import {
  loadCfg, saveCfg,
  buildShopifyProducts, buildAmazonProducts, buildChannelGroups,
  groupProductsByIdentity, sortProducts,
} from "@/components/dashboard/cross-channel/crossChannelUtils";
import type { MetricId } from "@/components/dashboard/cross-channel/crossChannelTypes";

export interface UseCrossChannelDataResult {
  // Data
  shopifyProducts: ProductRow[];
  amazonProducts: ProductRow[];
  channelGroups: ChannelGroup[];
  groupedProducts: any[];

  // Loading state
  loading: boolean;

  // View config
  cfg: ViewConfig;
  updateCfg: (next: ViewConfig) => void;
  handleSortToggle: (id: MetricId) => void;

  // UI state
  section: ActiveSection;
  setSection: (s: ActiveSection) => void;
  expanded: Set<string>;
  toggleExpanded: (id: string) => void;
  expandedChannels: Set<string>;
  toggleChannel: (key: string) => void;
  showAllByChannel: Map<string, boolean>;
  toggleShowAll: (channelKey: string) => void;
  settingsOpen: boolean;
  setSettingsOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
}

export function useCrossChannelData(
  filter: string,
  from: string,
  to: string,
  marketplace: string
): UseCrossChannelDataResult {
  const [shopifyRaw,   setShopifyRaw]   = useState<any[]>([]);
  const [amazonPerMp,  setAmazonPerMp]  = useState<{ mp: string; products: AmazonProduct[] }[]>([]);
  const [amazonImages, setAmazonImages] = useState<Record<string, string>>({});
  const [loading,      setLoading]      = useState(true);
  const [channelGroups, setChannelGroups] = useState<ChannelGroup[]>([]);

  const [cfg,        setCfg]        = useState<ViewConfig>(DEFAULT_CONFIG);
  const [section,    setSection]    = useState<ActiveSection>("all");
  const [expanded,   setExpanded]   = useState<Set<string>>(new Set());
  const [expandedChannels,   setExpandedChannels]   = useState<Set<string>>(new Set());
  const [showAllByChannel,   setShowAllByChannel]   = useState<Map<string, boolean>>(new Map());
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Hydrate cfg from localStorage after mount (avoid SSR mismatch)
  useEffect(() => { setCfg(loadCfg()); }, []);

  const updateCfg = useCallback((next: ViewConfig) => {
    setCfg(next);
    saveCfg(next);
  }, []);

  const handleSortToggle = useCallback((id: MetricId) => {
    setCfg(prev => {
      const next: ViewConfig = prev.sortBy === id
        ? { ...prev, sortDir: prev.sortDir === "desc" ? "asc" : "desc" }
        : { ...prev, sortBy: id, sortDir: "desc" };
      saveCfg(next);
      return next;
    });
  }, []);

  const toggleExpanded = useCallback((id: string) => {
    setExpanded(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }, []);

  const toggleChannel = useCallback((key: string) => {
    setExpandedChannels(prev => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  }, []);

  const toggleShowAll = useCallback((channelKey: string) => {
    setShowAllByChannel(prev => {
      const n = new Map(prev);
      n.set(channelKey, !n.get(channelKey));
      return n;
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const dateParams: Record<string, string> = { filter };
      if (filter === "custom") {
        if (from) dateParams.from = from;
        if (to)   dateParams.to   = to;
      }

      const isAmazon    = isAmazonChannel(marketplace);
      const amazonMp    = amazonChannelCode(marketplace);
      const isShopifyMp = !isAmazon && marketplace !== "all";

      if (cfg.viewMode === "groupByProduct") {
        const mpsToLoad = marketplace === "all"
          ? [...ALL_AMAZON_MPS]
          : isAmazon && amazonMp ? [amazonMp] : [];

        const shopifyParams: Record<string, string> = { ...dateParams, sortBy: "grossRevenue", sortDir: "desc" };
        if (isShopifyMp) shopifyParams.marketplace = marketplace;

        const [shopifyRes, ...amazonResArr] = await Promise.all([
          isAmazon ? Promise.resolve({ products: [] }) : api.products(shopifyParams).catch(() => ({ products: [] })),
          ...mpsToLoad.map(mp =>
            isShopifyMp ? Promise.resolve({ products: [] }) :
              api.amazon.products({ ...dateParams, marketplace: mp, sortBy: "grossRevenue", sortDir: "desc" }).catch(() => ({ products: [] }))
          ),
        ]);

        setShopifyRaw((shopifyRes as any).products ?? []);
        const perMp = mpsToLoad.map((mp, i) => ({ mp, products: (amazonResArr[i] as any).products ?? [] }));
        setAmazonPerMp(perMp);
        setChannelGroups([]);

        const allAsins = [...new Set(perMp.flatMap(({ products }) => products.map((p: AmazonProduct) => p.asin)))];
        if (allAsins.length > 0) {
          api.amazon.catalogImages(allAsins).then(map => {
            const filtered: Record<string, string> = {};
            for (const [k, v] of Object.entries(map)) { if (v) filtered[k] = v; }
            setAmazonImages(prev => ({ ...prev, ...filtered }));
          }).catch(() => {});
        }
      } else {
        const mpsToLoad = isAmazon && amazonMp ? [amazonMp] : [...ALL_AMAZON_MPS];
        const shopifyParams: Record<string, string> = { ...dateParams, sortBy: "grossRevenue", sortDir: "desc" };
        if (isShopifyMp) shopifyParams.marketplace = marketplace;

        const [shopifyRes, ...amazonResArr] = await Promise.all([
          isAmazon ? Promise.resolve({ products: [] }) : api.products(shopifyParams).catch(() => ({ products: [] })),
          ...mpsToLoad.map(mp =>
            isShopifyMp ? Promise.resolve({ products: [] }) :
              api.amazon.products({ ...dateParams, marketplace: mp, sortBy: "grossRevenue", sortDir: "desc" }).catch(() => ({ products: [] }))
          ),
        ]);

        setShopifyRaw((shopifyRes as any).products ?? []);
        const perMp = mpsToLoad.map((mp, i) => ({ mp, products: (amazonResArr[i] as any).products ?? [] }));
        setAmazonPerMp(perMp);

        const shopifyProds = buildShopifyProducts((shopifyRes as any).products ?? []);
        const amazonProds  = buildAmazonProducts(perMp);
        let groups = buildChannelGroups(shopifyProds, amazonProds, cfg.sortBy, cfg.sortDir);

        const filteredGroups = isAmazon && amazonMp
          ? groups.filter(g => g.channelKey === `AMAZON_${amazonMp}`)
          : marketplace !== "all"
          ? groups.filter(g => g.source !== "amazon" && g.channelKey === marketplace)
          : groups;

        setChannelGroups(filteredGroups);

        const allAsins = [...new Set(perMp.flatMap(({ products }) => products.map((p: AmazonProduct) => p.asin)))];
        if (allAsins.length > 0) {
          api.amazon.catalogImages(allAsins).then(map => {
            const filtered: Record<string, string> = {};
            for (const [k, v] of Object.entries(map)) { if (v) filtered[k] = v; }
            setAmazonImages(prev => ({ ...prev, ...filtered }));
          }).catch(() => {});
        }
      }
    } catch (e) {
      console.error("[useCrossChannelData]", e);
    } finally {
      setLoading(false);
    }
  }, [filter, from, to, marketplace, cfg.sortBy, cfg.sortDir, cfg.viewMode]);

  useEffect(() => {
    setExpanded(new Set());
    setExpandedChannels(new Set());
    setShowAllByChannel(new Map());
    load();
  }, [filter, from, to, marketplace, load]);

  const shopifyProducts = useMemo(
    () => sortProducts(buildShopifyProducts(shopifyRaw), cfg.sortBy, cfg.sortDir),
    [shopifyRaw, cfg.sortBy, cfg.sortDir]
  );

  const amazonProducts = useMemo(
    () => sortProducts(buildAmazonProducts(amazonPerMp, amazonImages), cfg.sortBy, cfg.sortDir),
    [amazonPerMp, amazonImages, cfg.sortBy, cfg.sortDir]
  );

  const groupedProducts = useMemo(
    () => groupProductsByIdentity(amazonProducts, shopifyProducts),
    [amazonProducts, shopifyProducts]
  );

  return {
    shopifyProducts,
    amazonProducts,
    channelGroups,
    groupedProducts,
    loading,
    cfg,
    updateCfg,
    handleSortToggle,
    section,
    setSection,
    expanded,
    toggleExpanded,
    expandedChannels,
    toggleChannel,
    showAllByChannel,
    toggleShowAll,
    settingsOpen,
    setSettingsOpen,
  };
}
