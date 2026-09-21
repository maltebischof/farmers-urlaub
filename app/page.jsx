"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  EMPLOYEES, findEmployee, PACKAGING_OPTS, PALLET_OPTS, CERT_OPTS, CATEGORY_OPTS,
  COUNTRY_OPTS, UNITS, TXT, optLabel, categoryLabel, unitLabel,
} from "../lib/constants";

// ---------- Hilfsfunktionen ----------
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function fmtDateIso(iso, lang) {
  if (!iso) return "–";
  const [y, m, d] = iso.split("-");
  if (!y) return "–";
  return lang === "en" ? `${d}/${m}/${y}` : `${d}.${m}.${y}`;
}
function fmtDateTs(ts, lang) {
  if (!ts) return "–";
  const d = new Date(ts);
  return lang === "en" ? d.toLocaleDateString("en-GB") : d.toLocaleDateString("de-DE");
}
function fmtMoney(v, lang) {
  const n = Number(v);
  if (isNaN(n)) return "–";
  return n.toLocaleString(lang === "en" ? "en-GB" : "de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}
function daysUntilIso(iso) {
  if (!iso) return null;
  const target = new Date(iso + "T00:00:00").getTime();
  return (target - Date.now()) / 86400000;
}
function csvEscape(s) {
  const v = String(s == null ? "" : s);
  return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}
function productLabel(p, lang) {
  if (!p) return "?";
  return lang === "en" ? (p.name_en || p.name_de) : (p.name_de || p.name_en);
}
const PRICE_MATCH_RANGE = 0.15; // +15%
function matchingOffersFor(offers, request) {
  const reqPrice = Number(request.price);
  if (!reqPrice) return [];
  return offers
    .filter((o) => o.status === "open" && o.product_id === request.product_id && o.creator_id !== request.creator_id && Number(o.price) <= reqPrice * (1 + PRICE_MATCH_RANGE))
    .sort((a, b) => a.price - b.price);
}
function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export default function Home() {
  const [currentUser, setCurrentUser] = useState(null);
  const [lang, setLang] = useState("de");
  const [tab, setTab] = useState("dashboard");
  const [products, setProducts] = useState([]);
  const [requests, setRequests] = useState([]);
  const [offers, setOffers] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [tenders, setTenders] = useState([]);
  const [offersSubTab, setOffersSubTab] = useState("overview");
  const [requestsSubTab, setRequestsSubTab] = useState("general");
  const [tenderView, setTenderView] = useState("list"); // list | form | detail
  const [selectedTenderId, setSelectedTenderId] = useState(null);
  const [offersFilters, setOffersFilters] = useState({ producer: "", supplierId: "", priceMin: "", priceMax: "", deliveryFrom: "", deliveryTo: "" });
  const [requestsFilters, setRequestsFilters] = useState({ producer: "", origin: "", priceMin: "", priceMax: "", deliveryFrom: "", deliveryTo: "" });
  const [marketSupplierFilter, setMarketSupplierFilter] = useState("");
  const [ready, setReady] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [productFilter, setProductFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [marketFilter, setMarketFilter] = useState("");
  const [marketSort, setMarketSort] = useState("price_asc");
  const [offersSort, setOffersSort] = useState("newest");
  const [requestsSort, setRequestsSort] = useState("newest");
  const [archiveProduct, setArchiveProduct] = useState("");
  const [archiveType, setArchiveType] = useState("all");
  const [archiveFrom, setArchiveFrom] = useState("");
  const [archiveTo, setArchiveTo] = useState("");
  const [activeProductId, setActiveProductId] = useState(null);
  const [showProductForm, setShowProductForm] = useState(false);
  const [entryForm, setEntryForm] = useState(null); // { type: 'request'|'offer', presetProductId }
  const [contactItem, setContactItem] = useState(null); // { item, itemType }
  const [matchResults, setMatchResults] = useState(null); // { product, requestPrice, matches }
  const archivingRef = useRef({});

  const t = (key) => (TXT[lang] && TXT[lang][key]) || key;

  function toast(msg) {
    const id = uid();
    setToasts((prev) => [...prev, { id, msg }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 2800);
  }

  // ---------- Boot: LocalStorage ----------
  useEffect(() => {
    try {
      const uidSaved = localStorage.getItem("farmers_marktplatz_user");
      const emp = findEmployee(uidSaved);
      if (emp) setCurrentUser(emp);
      const l = localStorage.getItem("farmers_marktplatz_lang");
      if (l === "en" || l === "de") setLang(l);
    } catch (e) {}
  }, []);

  function loginAs(u) {
    setCurrentUser(u);
    try { localStorage.setItem("farmers_marktplatz_user", u.id); } catch (e) {}
  }
  function logout() {
    setCurrentUser(null);
    try { localStorage.setItem("farmers_marktplatz_user", ""); } catch (e) {}
  }
  function changeLang(l) {
    setLang(l);
    try { localStorage.setItem("farmers_marktplatz_lang", l); } catch (e) {}
  }

  // ---------- Supabase: initial laden + Realtime-Abos ----------
  async function loadAll() {
    const [p, r, o, n, f, c, s, td] = await Promise.all([
      supabase.from("products").select("*").order("created_at", { ascending: false }).limit(1000),
      supabase.from("requests").select("*").order("created_at", { ascending: false }).limit(2000),
      supabase.from("offers").select("*").order("created_at", { ascending: false }).limit(2000),
      supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("favorites").select("*").limit(2000),
      supabase.from("customers").select("*").order("created_at", { ascending: false }).limit(2000),
      supabase.from("suppliers").select("*").order("created_at", { ascending: false }).limit(2000),
      supabase.from("tenders").select("*").order("created_at", { ascending: false }).limit(1000),
    ]);
    if (p.error) console.error("products load error", p.error);
    if (r.error) console.error("requests load error", r.error);
    if (o.error) console.error("offers load error", o.error);
    if (n.error) console.error("notifications load error", n.error);
    if (f.error) console.error("favorites load error", f.error);
    if (c.error) console.error("customers load error", c.error);
    if (s.error) console.error("suppliers load error", s.error);
    if (td.error) console.error("tenders load error", td.error);
    setProducts(p.data || []);
    setRequests(r.data || []);
    setOffers(o.data || []);
    setNotifications(n.data || []);
    setFavorites(f.data || []);
    setCustomers(c.data || []);
    setSuppliers(s.data || []);
    setTenders(td.data || []);
    setReady(true);
  }

  useEffect(() => {
    loadAll();
    const channel = supabase
      .channel("farmers-marktplatz-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "requests" }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "offers" }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "favorites" }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "customers" }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "suppliers" }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "tenders" }, () => loadAll())
      .subscribe();
    // Zusätzliches Polling als Sicherheitsnetz (alle 20s), falls Realtime mal aussetzt
    const poll = setInterval(loadAll, 20000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Auto-Archivierung abgelaufener Einträge ----------
  useEffect(() => {
    const today = todayIso();
    requests.forEach((r) => {
      if (r.status === "open" && r.delivery_date && r.delivery_date < today && !archivingRef.current["r" + r.id]) {
        archivingRef.current["r" + r.id] = true;
        supabase.from("requests").update({ status: "archived", archived_at: new Date().toISOString() }).eq("id", r.id).then(() => {});
      }
    });
    offers.forEach((o) => {
      if (o.status === "open" && o.valid_until && o.valid_until < today && !archivingRef.current["o" + o.id]) {
        archivingRef.current["o" + o.id] = true;
        supabase.from("offers").update({ status: "archived", archived_at: new Date().toISOString() }).eq("id", o.id).then(() => {});
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests, offers]);

  // ---------- Data helpers ----------
  const productById = (id) => products.find((p) => p.id === id);
  const openRequestsFor = (pid) => requests.filter((r) => r.product_id === pid && r.status === "open").sort((a, b) => (a.delivery_date || "").localeCompare(b.delivery_date || ""));
  const openOffersFor = (pid) => offers.filter((o) => o.product_id === pid && o.status === "open").sort((a, b) => a.price - b.price);
  const bestOfferFor = (pid) => openOffersFor(pid)[0] || null;
  const distinctCategories = useMemo(() => {
    const set = {};
    products.forEach((p) => { if (p.category) set[p.category] = true; });
    return Object.keys(set);
  }, [products]);
  const myFavoriteIds = useMemo(() => new Set(favorites.filter((f) => f.user_id === currentUser?.id).map((f) => f.product_id)), [favorites, currentUser]);
  function isFavorite(productId) { return myFavoriteIds.has(productId); }
  async function toggleFavorite(productId) {
    if (isFavorite(productId)) {
      const { error } = await supabase.from("favorites").delete().eq("user_id", currentUser.id).eq("product_id", productId);
      if (error) { console.error("favorites delete error", error); toast(t("genericError") + error.message); return; }
    } else {
      const { error } = await supabase.from("favorites").insert({ user_id: currentUser.id, product_id: productId });
      if (error) { console.error("favorites insert error", error); toast(t("genericError") + error.message); return; }
    }
    loadAll();
  }
  function priceHistoryFor(productId, days = 60) {
    const cutoff = Date.now() - days * 86400000;
    const off = offers.filter((o) => o.product_id === productId && new Date(o.created_at).getTime() >= cutoff);
    const req = requests.filter((r) => r.product_id === productId && new Date(r.created_at).getTime() >= cutoff);
    return { offersHistory: off, requestsHistory: req };
  }
  const myUnread = currentUser ? notifications.filter((n) => n.target_user_id === currentUser.id && !n.read) : [];

  // ---------- Actions ----------
  async function createProduct(data) {
    const { error } = await supabase.from("products").insert({
      sku: data.sku, name_de: data.nameDe, name_en: data.nameEn, category: data.category,
      packaging: data.packaging, pallet: data.pallet, certifications: data.certifications,
      created_by: currentUser.name,
    });
    if (error) { console.error(error); toast(t("genericError") + error.message); return; }
    toast(t("productCreated"));
    loadAll();
  }

  async function createCustomer(data) {
    const rep = findEmployee(data.salesRepId);
    const { error } = await supabase.from("customers").insert({
      customer_number: data.customerNumber, name: data.name, postal_code: data.postalCode,
      sales_rep_id: data.salesRepId, sales_rep_name: rep ? rep.name : data.salesRepId,
      created_by: currentUser.name,
    });
    if (error) { console.error(error); toast(t("genericError") + error.message); return; }
    toast(t("customerCreated"));
    loadAll();
  }

  async function createSupplier(data) {
    const sup = findEmployee(data.supervisorId);
    const { error } = await supabase.from("suppliers").insert({
      supplier_number: data.supplierNumber || "", name: data.name,
      supervisor_id: data.supervisorId, supervisor_name: sup ? sup.name : data.supervisorId,
      created_by: currentUser.name,
    });
    if (error) { console.error(error); toast(t("genericError") + error.message); return; }
    toast(t("supplierCreated"));
    loadAll();
  }

  async function createTender(data) {
    const cust = customers.find((c) => c.id === data.customerId);
    const { data: tenderRow, error } = await supabase.from("tenders").insert({
      customer_id: data.customerId, title: data.title || "",
      created_by: currentUser.name, creator_id: currentUser.id, creator_email: currentUser.email, status: "open",
    }).select().single();
    if (error) { console.error(error); toast(t("genericError") + error.message); return; }
    const validLines = data.lines.filter((l) => l.productId && l.quantity && l.price && l.deliveryDate);
    for (const line of validLines) {
      await supabase.from("requests").insert({
        product_id: line.productId, quantity: Number(line.quantity), unit: line.unit, price: Number(line.price),
        origin_country: "", producer: "", comment: "",
        customer: cust ? cust.name : "", customer_id: data.customerId, tender_id: tenderRow.id,
        created_by: currentUser.name, created_by_role: currentUser.role, creator_id: currentUser.id, creator_email: currentUser.email,
        status: "open", delivery_date: line.deliveryDate,
      });
    }
    toast(t("tenderCreated"));
    loadAll();
  }

  async function notifyMatches(newItem, newItemType, product) {
    const isOffer = newItemType === "offer";
    const matchPool = isOffer ? requests : offers;
    const newPrice = Number(newItem.price);
    const matches = matchPool.filter((x) => {
      if (x.status !== "open" || x.product_id !== newItem.productId || x.creator_id === currentUser.id) return false;
      const offerPrice = isOffer ? newPrice : Number(x.price);
      const requestPrice = isOffer ? Number(x.price) : newPrice;
      if (!offerPrice || !requestPrice) return false;
      return offerPrice <= requestPrice * (1 + PRICE_MATCH_RANGE);
    });
    const seen = new Set();
    for (const m of matches) {
      if (seen.has(m.creator_id)) continue;
      seen.add(m.creator_id);
      await supabase.from("notifications").insert({
        target_user_id: m.creator_id, target_user_name: m.created_by,
        from_user_id: currentUser.id, from_user_name: currentUser.name, from_user_email: currentUser.email,
        item_type: isOffer ? "offer" : "request", product_id: newItem.productId, product_name_de: product ? product.name_de : "", product_name_en: product ? product.name_en : "",
        quantity: Number(newItem.quantity), unit: newItem.unit, price: Number(newItem.price),
        origin_country: newItem.originCountry || "", producer: newItem.producer || "",
        kind: "match", read: false,
      });
    }
    return matches;
  }

  async function createEntry(type, data) {
    const isRequest = type === "request";
    const table = isRequest ? "requests" : "offers";
    const body = {
      product_id: data.productId, quantity: Number(data.quantity), unit: data.unit, price: Number(data.price),
      origin_country: data.originCountry || "", producer: data.producer || "", comment: data.comment || "",
      created_by: currentUser.name, created_by_role: currentUser.role, creator_id: currentUser.id, creator_email: currentUser.email,
      status: "open",
    };
    if (isRequest) {
      body.delivery_date = data.date;
      body.customer_id = data.customerId || null;
      const cust = data.customerId ? customers.find((c) => c.id === data.customerId) : null;
      body.customer = cust ? cust.name : "";
    } else {
      body.valid_until = data.date;
      body.supplier_id = data.supplierId || null;
    }
    const { error } = await supabase.from(table).insert(body);
    if (error) { console.error(error); toast(t("genericError") + error.message); return; }
    toast(isRequest ? t("requestCreated") : t("offerCreated"));
    const product = productById(data.productId);
    const matches = await notifyMatches(data, type, product);
    if (matches.length > 0) {
      const best = [...matches].sort((a, b) => a.price - b.price)[0];
      toast(t("priceMatchToast").replace("{n}", matches.length).replace("{price}", fmtMoney(best.price, lang)));
      await supabase.from("notifications").insert({
        target_user_id: currentUser.id, target_user_name: currentUser.name,
        from_user_id: currentUser.id, from_user_name: currentUser.name, from_user_email: currentUser.email,
        item_type: isRequest ? "offer" : "request", product_id: data.productId, product_name_de: product ? product.name_de : "", product_name_en: product ? product.name_en : "",
        quantity: best.quantity, unit: best.unit, price: best.price,
        origin_country: best.origin_country || "", producer: best.producer || "",
        kind: "price_match", read: false,
      });
      if (isRequest) setMatchResults({ product, requestPrice: Number(data.price), matches: [...matches].sort((a, b) => a.price - b.price) });
    }
    loadAll();
  }

  async function markDone(table, id) {
    const { error } = await supabase.from(table).update({ status: "done" }).eq("id", id);
    if (error) toast(t("genericError") + error.message); else loadAll();
  }
  async function reopenEntry(table, id) {
    const { error } = await supabase.from(table).update({ status: "open" }).eq("id", id);
    if (error) toast(t("genericError") + error.message); else loadAll();
  }
  async function deleteEntry(table, id) {
    if (!confirm(t("confirmDelete"))) return;
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) toast(t("genericError") + error.message); else loadAll();
  }
  async function markNotificationRead(id) {
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    loadAll();
  }

  // ---------- Kontakt / Mail-Workflow ----------
  function buildEmailText(emailLang, item, itemType, senderName, nego) {
    const isOffer = itemType === "offer";
    const product = productById(item.product_id);
    const productName = productLabel(product, emailLang);
    const word = emailLang === "en" ? (isOffer ? "offer" : "request") : (isOffer ? "Angebot" : "Gesuch");
    const dateLabel = emailLang === "en" ? (isOffer ? "Valid until" : "Delivery date") : (isOffer ? "Gültig bis" : "Liefertermin");
    const dateVal = isOffer ? item.valid_until : item.delivery_date;
    const dateStr = fmtDateIso(dateVal, emailLang);
    const unit = unitLabel(item.unit, emailLang);
    const priceStr = fmtMoney(item.price, emailLang);
    const firstName = (item.created_by || "").split(" ")[0] || "";
    const producerSuffix = item.producer ? ` – ${emailLang === "en" ? "Producer" : "Produzent"}: ${item.producer}` : "";
    const subject = `${emailLang === "en" ? "Regarding your " + word : "Anfrage zu deinem " + word}: ${productName} (${item.quantity} ${unit})${producerSuffix}`;
    const lines = [];
    lines.push((emailLang === "en" ? "Hi " : "Hallo ") + firstName + ",");
    lines.push("");
    lines.push(`${emailLang === "en" ? "I'm interested in your" : "ich interessiere mich für dein"} ${word} ${emailLang === "en" ? "for" : "für"} ${productName} (${item.quantity} ${unit} @ ${priceStr}).`);
    lines.push(`${dateLabel}: ${dateStr}`);
    if (item.origin_country) lines.push(`${emailLang === "en" ? "Origin" : "Herkunft"}: ${item.origin_country}`);
    if (item.producer) lines.push(`${emailLang === "en" ? "Producer" : "Produzent"}: ${item.producer}`);
    if (item.comment) lines.push(`${emailLang === "en" ? "Comment" : "Kommentar"}: ${item.comment}`);
    const hasNego = isOffer && nego && (nego.customer || nego.deliveryDate || nego.deliveryQty || nego.priceExpectation);
    if (hasNego) {
      lines.push("");
      lines.push(TXT[emailLang].customerRequestHeading);
      if (nego.customer) lines.push(`${TXT[emailLang].customerLabel}: ${nego.customer}`);
      if (nego.deliveryDate) lines.push(`${TXT[emailLang].requestedDelivery}: ${fmtDateIso(nego.deliveryDate, emailLang)}`);
      if (nego.deliveryQty) lines.push(`${TXT[emailLang].requestedQty}: ${nego.deliveryQty} ${unit}`);
      if (nego.priceExpectation) lines.push(`${TXT[emailLang].priceExpectationLabel.replace(" (€)", "")}: ${fmtMoney(nego.priceExpectation, emailLang)}`);
    }
    lines.push("");
    lines.push(hasNego ? TXT[emailLang].emailBodyClosingNego : TXT[emailLang].emailBodyClosing);
    lines.push("");
    lines.push(emailLang === "en" ? "Best regards" : "Viele Grüße");
    lines.push(senderName);
    return { subject, body: lines.join("\n") };
  }

  async function recordNotificationAndOpenMail(item, itemType, to, subject, body, nego) {
    const product = productById(item.product_id);
    if (item.creator_id) {
      await supabase.from("notifications").insert({
        target_user_id: item.creator_id, target_user_name: item.created_by,
        from_user_id: currentUser.id, from_user_name: currentUser.name, from_user_email: currentUser.email,
        item_type: itemType, item_id: item.id, product_id: item.product_id, product_name_de: product ? product.name_de : "", product_name_en: product ? product.name_en : "",
        quantity: item.quantity, unit: item.unit, price: item.price,
        origin_country: item.origin_country || "", producer: item.producer || "", read: false,
        requested_customer: nego && nego.customer ? nego.customer : null,
        requested_delivery_date: nego && nego.deliveryDate ? nego.deliveryDate : null,
        requested_quantity: nego && nego.deliveryQty ? Number(nego.deliveryQty) : null,
        price_expectation: nego && nego.priceExpectation ? Number(nego.priceExpectation) : null,
      });
      loadAll();
    }
    const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailto, "_blank");
    toast(t("interestRecorded"));
  }

  // ---------- CSV-Export (mit korrektem, eindeutigem ISO-Datum — behebt das Jahres-Problem) ----------
  function refDateIso(item, isOffer) { return isOffer ? item.valid_until : item.delivery_date; }
  function passesArchiveFilter(item, isOffer) {
    if (item.status === "open") return false;
    if (archiveProduct && item.product_id !== archiveProduct) return false;
    const rd = refDateIso(item, isOffer);
    if (archiveFrom && (!rd || rd < archiveFrom)) return false;
    if (archiveTo && (!rd || rd > archiveTo)) return false;
    return true;
  }
  function getArchiveCombined() {
    const archOffers = archiveType !== "requests" ? offers.filter((o) => passesArchiveFilter(o, true)) : [];
    const archRequests = archiveType !== "offers" ? requests.filter((r) => passesArchiveFilter(r, false)) : [];
    return [
      ...archOffers.map((o) => ({ ...o, _type: "offer" })),
      ...archRequests.map((r) => ({ ...r, _type: "request" })),
    ].sort((a, b) => (refDateIso(b, b._type === "offer") || "").localeCompare(refDateIso(a, a._type === "offer") || ""));
  }
  function exportArchiveCsv() {
    const combined = getArchiveCombined();
    const header = lang === "en"
      ? ["Type","Article no.","Product (EN)","Category","Quantity","Unit","Price (EUR)","Origin","Producer","Created by","Reference date","Created at","Status","Comment"]
      : ["Typ","Artikelnummer","Produkt (DE)","Kategorie","Menge","Einheit","Preis (EUR)","Herkunftsland","Produzent","Erstellt von","Referenzdatum","Erstellt am","Status","Kommentar"];
    const lines = [header.map(csvEscape).join(";")];
    combined.forEach((item) => {
      const p = productById(item.product_id);
      const isOffer = item._type === "offer";
      lines.push([
        isOffer ? (lang === "en" ? "Offer" : "Angebot") : (lang === "en" ? "Request" : "Gesuch"),
        p ? p.sku : "", p ? (lang === "en" ? p.name_en : p.name_de) : "", p ? categoryLabel(p.category, lang) : "",
        item.quantity, item.unit, item.price, item.origin_country || "", item.producer || "", item.created_by,
        refDateIso(item, isOffer) || "",                          // bereits im eindeutigen Format YYYY-MM-DD — keine Jahres-Fehlinterpretation in Excel
        item.created_at ? item.created_at.slice(0, 10) : "",
        t("status" + item.status.charAt(0).toUpperCase() + item.status.slice(1)), item.comment || "",
      ].map(csvEscape).join(";"));
    });
    const csv = "\uFEFF" + lines.join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `farmers-${lang === "en" ? "price-history" : "preisverlauf"}-${todayIso()}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast(t("exportSuccess"));
  }

  // ================= RENDER =================
  if (!currentUser) {
    return (
      <div className="login-wrap">
        <div className="card login-card">
          <div className="langToggle" style={{ justifyContent: "center", marginBottom: 14 }}>
            <button className={lang === "de" ? "active" : ""} onClick={() => changeLang("de")}>DE</button>
            <button className={lang === "en" ? "active" : ""} onClick={() => changeLang("en")}>EN</button>
          </div>
          <img src="/logo.svg" alt="Farmers for Pets" className="login-logo-img" />
          <div className="tagline">{t("tagline")}</div>
          <p className="muted">{t("loginPrompt")}</p>
          <select id="loginSelect" defaultValue="">
            <option value="">{t("chooseEmployee")}</option>
            <optgroup label={t("sales")}>
              {EMPLOYEES.filter((e) => e.role === "sales" || e.role === "manager").map((e) => (
                <option key={e.id} value={e.id}>{e.name}{e.role === "manager" ? ` (${t("manager")})` : ""}</option>
              ))}
            </optgroup>
            <optgroup label={t("purchasing")}>
              {EMPLOYEES.filter((e) => e.role === "purchasing").map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </optgroup>
          </select>
          <button
            className="btn"
            style={{ marginTop: 16, width: "100%" }}
            onClick={() => {
              const val = document.getElementById("loginSelect").value;
              const u = findEmployee(val);
              if (!u) { toast(t("chooseEmployeeWarn")); return; }
              loginAs(u);
            }}
          >
            {t("login")}
          </button>
        </div>
      </div>
    );
  }

  const u = currentUser;
  const canRequest = u.role === "sales" || u.role === "manager";
  const canOffer = u.role === "purchasing" || u.role === "manager";
  const tabs = [
    { id: "dashboard", label: t("tabDashboard"), badge: myUnread.length },
    { id: "products", label: t("tabProducts") },
    { id: "market", label: t("tabMarket") },
    { id: "offers", label: t("tabOffers") },
    { id: "requests", label: t("tabRequests") },
    ...(canRequest ? [{ id: "customers", label: t("tabCustomers") }] : []),
    ...(canOffer ? [{ id: "suppliers", label: t("tabSuppliers") }] : []),
    { id: "mine", label: t("tabMine") },
    { id: "archive", label: t("tabArchive") },
  ];

  return (
    <div className="app-root">
      <header className="topbar">
        <div className="brand"><img src="/logo.svg" alt="Farmers for Pets" className="logo-img" /><span>{t("tagline")}</span></div>
        <div className="userbox">
          <div className="langToggle">
            <button className={lang === "de" ? "active" : ""} onClick={() => changeLang("de")}>DE</button>
            <button className={lang === "en" ? "active" : ""} onClick={() => changeLang("en")}>EN</button>
          </div>
          <span>{u.name} · <span className={`badge role-${u.role === "purchasing" ? "purchasing" : "sales"}`}>{t(u.role)}</span></span>
          <button onClick={logout}>{t("logout")}</button>
        </div>
      </header>
      <nav className="tabs">
        {tabs.map((tb) => (
          <button key={tb.id} className={tab === tb.id ? "active" : ""} onClick={() => { setTab(tb.id); setActiveProductId(null); }}>
            {tb.label}{tb.badge ? <span className="tabDot">{tb.badge}</span> : null}
          </button>
        ))}
      </nav>
      <main>
        {!ready && <div className="card muted">{t("loading")}</div>}
        {ready && tab === "dashboard" && (
          <Dashboard {...{ t, lang, u, requests, offers, notifications, myUnread, productById, unitLabel, fmtDateIso, fmtDateTs, fmtMoney, daysUntilIso, markNotificationRead, setContactItem, setActiveProductId, setTab }} />
        )}
        {ready && tab === "products" && (
          <Products {...{ t, lang, products, productFilter, setProductFilter, categoryFilter, setCategoryFilter, distinctCategories, openOffersFor, openRequestsFor, setActiveProductId, setShowProductForm, isFavorite, toggleFavorite, favoritesOnly, setFavoritesOnly }} />
        )}
        {ready && tab === "market" && (
          <Market {...{ t, lang, products, marketFilter, setMarketFilter, categoryFilter, setCategoryFilter, distinctCategories, marketSort, setMarketSort, offers, suppliers, marketSupplierFilter, setMarketSupplierFilter, openRequestsFor, openOffersFor, daysUntilIso, fmtDateIso, fmtMoney, unitLabel, setActiveProductId, canRequest, currentUser, setContactItem, isFavorite, toggleFavorite, favoritesOnly, setFavoritesOnly }} />
        )}
        {ready && tab === "offers" && (
          <>
            <nav className="tabs" style={{ marginBottom: 14, borderRadius: 8, overflow: "hidden" }}>
              <button className={offersSubTab === "overview" ? "active" : ""} onClick={() => setOffersSubTab("overview")}>{t("offersSubOverview")}</button>
              <button className={offersSubTab === "all" ? "active" : ""} onClick={() => setOffersSubTab("all")}>{t("offersSubAll")}</button>
            </nav>
            {offersSubTab === "overview" && (
              <OffersOverview {...{ t, lang, products, productFilter, setProductFilter, categoryFilter, setCategoryFilter, distinctCategories, openOffersFor, bestOfferFor, setActiveProductId, setEntryForm, canOffer, fmtMoney, unitLabel }} />
            )}
            {offersSubTab === "all" && (
              <FlatList {...{ t, lang, isOffers: true, items: offers, sortKey: offersSort, setSortKey: setOffersSort, productById, unitLabel, fmtMoney, fmtDateIso, currentUser, canContact: canRequest, setActiveProductId, setContactItem, canCreate: canOffer, setEntryForm, filters: offersFilters, setFilters: setOffersFilters, suppliers }} />
            )}
          </>
        )}
        {ready && tab === "requests" && (
          <>
            <nav className="tabs" style={{ marginBottom: 14, borderRadius: 8, overflow: "hidden" }}>
              <button className={requestsSubTab === "general" ? "active" : ""} onClick={() => setRequestsSubTab("general")}>{t("requestsSubGeneral")}</button>
              <button className={requestsSubTab === "tender" ? "active" : ""} onClick={() => setRequestsSubTab("tender")}>{t("requestsSubTender")}</button>
            </nav>
            {requestsSubTab === "general" && (
              <FlatList {...{ t, lang, isOffers: false, items: requests.filter((r) => !r.tender_id), sortKey: requestsSort, setSortKey: setRequestsSort, productById, unitLabel, fmtMoney, fmtDateIso, currentUser, canContact: canOffer, setActiveProductId, setContactItem, canCreate: canRequest, setEntryForm, filters: requestsFilters, setFilters: setRequestsFilters }} />
            )}
            {requestsSubTab === "tender" && (
              <TenderSection {...{ t, lang, tenders, requests, offers, customers, products, currentUser, canRequest, tenderView, setTenderView, selectedTenderId, setSelectedTenderId, createTender, setActiveProductId, setContactItem, unitLabel, fmtMoney, fmtDateIso, productById }} />
            )}
          </>
        )}
        {ready && tab === "customers" && canRequest && (
          <Customers {...{ t, lang, requests, customers, currentUser, productById, unitLabel, fmtMoney, fmtDateIso, setActiveProductId, createCustomer, setShowCustomerForm }} />
        )}
        {ready && tab === "suppliers" && canOffer && (
          <Suppliers {...{ t, lang, suppliers, setShowSupplierForm }} />
        )}
        {ready && tab === "mine" && (
          <Mine {...{ t, lang, currentUser, requests, offers, productById, unitLabel, fmtMoney, fmtDateIso, markDone, reopenEntry, deleteEntry }} />
        )}
        {ready && tab === "archive" && (
          <Archive {...{ t, lang, products, archiveProduct, setArchiveProduct, archiveType, setArchiveType, archiveFrom, setArchiveFrom, archiveTo, setArchiveTo, getArchiveCombined, productById, unitLabel, fmtMoney, fmtDateIso, exportArchiveCsv }} />
        )}
      </main>

      {activeProductId && (
        <ProductModal {...{ t, lang, product: productById(activeProductId), currentUser, openRequestsFor, openOffersFor, close: () => setActiveProductId(null), unitLabel, fmtMoney, fmtDateIso, daysUntilIso, markDone, canRequest, canOffer, setEntryForm, activeProductId, setContactItem, isFavorite, toggleFavorite, priceHistoryFor }} />
      )}
      {showProductForm && (
        <ProductForm {...{ t, lang, close: () => setShowProductForm(false), createProduct }} />
      )}
      {showCustomerForm && (
        <CustomerForm {...{ t, lang, close: () => setShowCustomerForm(false), createCustomer }} />
      )}
      {showSupplierForm && (
        <SupplierForm {...{ t, lang, close: () => setShowSupplierForm(false), createSupplier }} />
      )}
      {entryForm && (
        <EntryForm {...{ t, lang, type: entryForm.type, presetProductId: entryForm.presetProductId, products, customers, suppliers, close: () => setEntryForm(null), createEntry, unitLabel }} />
      )}
      {contactItem && (
        <ContactModal {...{ t, lang, item: contactItem.item, itemType: contactItem.itemType, currentUser, buildEmailText, close: () => setContactItem(null), recordNotificationAndOpenMail, customers }} />
      )}
      {matchResults && (
        <MatchResultsModal {...{ t, lang, matchResults, unitLabel, fmtMoney, fmtDateIso, close: () => setMatchResults(null), setContactItem }} />
      )}

      <div>
        {toasts.map((x) => <div key={x.id} className="toast">{x.msg}</div>)}
      </div>
    </div>
  );
}

// ================= Unterkomponenten =================

function Dashboard({ t, lang, u, requests, offers, notifications, myUnread, productById, unitLabel, fmtDateIso, fmtDateTs, fmtMoney, daysUntilIso, markNotificationRead, setContactItem, setActiveProductId, setTab }) {
  const myOpenRequests = requests.filter((r) => r.status === "open" && r.creator_id === u.id).length;
  const myOpenOffers = offers.filter((o) => o.status === "open" && o.creator_id === u.id).length;
  const openRequests = requests.filter((r) => r.status === "open").length;
  const openOffers = offers.filter((o) => o.status === "open").length;
  const myRequestsWithMatches = (u.role === "sales" || u.role === "manager")
    ? requests.filter((r) => r.status === "open" && r.creator_id === u.id)
        .map((r) => ({ request: r, matches: matchingOffersFor(offers, r) }))
        .filter((x) => x.matches.length > 0)
    : [];
  const soon = offers.filter((o) => {
    if (o.status !== "open" || !o.valid_until) return false;
    const d = daysUntilIso(o.valid_until);
    return d !== null && d >= 0 && d <= 5;
  });
  const recent = [
    ...requests.map((r) => ({ ...r, _type: "request" })),
    ...offers.map((o) => ({ ...o, _type: "offer" })),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 8);
  const myNotifs = notifications.filter((n) => n.target_user_id === u.id).slice(0, 10);

  return (
    <>
      <div className="grid cols-4">
        <div className="card stat" style={{ cursor: "pointer" }} onClick={() => setTab("requests")}><div className="num">{openRequests}</div><div className="label">{t("openRequestsTotal")}</div></div>
        <div className="card stat" style={{ cursor: "pointer" }} onClick={() => setTab("offers")}><div className="num">{openOffers}</div><div className="label">{t("openOffersTotal")}</div></div>
        <div className="card stat" style={{ cursor: "pointer" }} onClick={() => setTab("mine")}><div className="num">{myOpenRequests}</div><div className="label">{t("myOpenRequests")}</div></div>
        <div className="card stat" style={{ cursor: "pointer" }} onClick={() => setTab("mine")}><div className="num">{myOpenOffers}</div><div className="label">{t("myOpenOffers")}</div></div>
      </div>
      {myRequestsWithMatches.length > 0 && (
        <div className="card">
          <h2>{t("dashboardMatchesTitle")}</h2>
          {myRequestsWithMatches.map(({ request, matches }) => {
            const p = productById(request.product_id);
            const best = matches[0];
            return (
              <div key={request.id} className="entry-row">
                <b>{productLabel(p, lang)}</b> — {t("myRequestPrice")}: {fmtMoney(request.price, lang)} · {request.quantity} {unitLabel(request.unit, lang)}
                {request.customer && <> · {t("customerLabel")}: {request.customer}</>}
                <br />
                {t("bestMatchLabel")}: <span className="badge best">{fmtMoney(best.price, lang)}</span> {best.quantity} {unitLabel(best.unit, lang)}, {t("validLabel")} {fmtDateIso(best.valid_until, lang)}
                {matches.length > 1 && <span className="muted"> ({t("plusMoreMatches").replace("{n}", matches.length - 1)})</span>}
                <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="btn small secondary" onClick={() => setActiveProductId(request.product_id)}>{t("colDetails")}</button>
                  <button className="btn small info" onClick={() => setContactItem({ item: best, itemType: "offer" })}>{t("contactBtnOffer")}</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="card">
        <h2>{t("notifications")}</h2>
        {myNotifs.length === 0 && <div className="empty-state">{t("noNotifications")}</div>}
        {myNotifs.map((n) => (
          <div key={n.id} className={`notif-item ${n.read ? "" : "unread"}`} style={{ cursor: n.product_id ? "pointer" : "default" }} onClick={() => n.product_id && setActiveProductId(n.product_id)}>
            {!n.read && <span className="badge unread">{t("newLabel")}</span>}{" "}
            {n.kind === "match" ? (
              <><span className="badge best">{t("matchBadge")}</span>{" "}
              {n.item_type === "offer" ? t("matchNotifOffer") : t("matchNotifRequest")} <b>{lang === "en" ? (n.product_name_en || n.product_name_de) : n.product_name_de}</b> ({n.quantity} {unitLabel(n.unit, lang)} @ {fmtMoney(n.price, lang)}, {n.from_user_name})</>
            ) : n.kind === "price_match" ? (
              <><span className="badge best">{t("matchBadge")}</span>{" "}
              {n.item_type === "offer" ? t("priceMatchSelfOffer") : t("priceMatchSelfRequest")} <b>{lang === "en" ? (n.product_name_en || n.product_name_de) : n.product_name_de}</b> ({n.quantity} {unitLabel(n.unit, lang)} @ {fmtMoney(n.price, lang)})</>
            ) : (
              <><b>{n.from_user_name}</b> {t("notifText")} {n.item_type === "offer" ? t("offerWord") : t("requestWord")} — <b>{lang === "en" ? (n.product_name_en || n.product_name_de) : n.product_name_de}</b> ({n.quantity} {unitLabel(n.unit, lang)} @ {fmtMoney(n.price, lang)})</>
            )}
            {(n.requested_customer || n.requested_delivery_date || n.requested_quantity || n.price_expectation) && (
              <div className="muted" style={{ marginTop: 4 }}>
                {n.requested_customer && <>{t("customerLabel")}: {n.requested_customer} · </>}
                {n.requested_quantity && <>{t("requestedQty")}: {n.requested_quantity} {unitLabel(n.unit, lang)} · </>}
                {n.requested_delivery_date && <>{t("requestedDelivery")}: {fmtDateIso(n.requested_delivery_date, lang)} · </>}
                {n.price_expectation && <>{t("priceExpectationLabel")}: {fmtMoney(n.price_expectation, lang)}</>}
              </div>
            )}
            <br /><span className="muted">{fmtDateTs(n.created_at, lang)}{(n.kind === "match" || n.kind === "price_match") ? "" : " · " + n.from_user_email}</span>
            <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {!n.read && <button className="btn small secondary" onClick={(e) => { e.stopPropagation(); markNotificationRead(n.id); }}>{t("markRead")}</button>}
              {(n.kind !== "match" && n.kind !== "price_match") && <a className="btn small info" href={`mailto:${encodeURIComponent(n.from_user_email)}`} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }} onClick={(e) => e.stopPropagation()}>{t("reopenEmail")}</a>}
            </div>
          </div>
        ))}
      </div>
      {soon.length > 0 && (
        <div className="card">
          <h2>{t("expiringSoon")}</h2>
          {soon.map((o) => {
            const p = productById(o.product_id);
            return (
              <div key={o.id} className="product-link" style={{ padding: "6px 0", borderBottom: "1px solid var(--border)", display: "block" }} onClick={() => setActiveProductId(o.product_id)}>
                <b>{productLabel(p, lang)}</b> — {fmtMoney(o.price, lang)} / {unitLabel(o.unit, lang)}, {t("validLabel")} {fmtDateIso(o.valid_until, lang)} <span className="muted">({o.created_by}, {o.origin_country})</span>
              </div>
            );
          })}
        </div>
      )}
      <div className="card">
        <h2>{t("recentActivity")}</h2>
        {recent.length === 0 && <div className="empty-state">{t("noEntriesYet")}</div>}
        {recent.map((item) => {
          const p = productById(item.product_id);
          return (
            <div key={item._type + item.id} className="entry-row product-link" style={{ display: "block" }} onClick={() => setActiveProductId(item.product_id)}>
              <span className={`badge ${item._type === "request" ? "role-sales" : "role-purchasing"}`}>{item._type === "request" ? t("sales") : t("purchasing")}</span>{" "}
              <b>{productLabel(p, lang)}</b> — {item.quantity} {unitLabel(item.unit, lang)} @ {fmtMoney(item.price, lang)}
              {item.origin_country ? " · " + item.origin_country : ""}{item.producer ? " / " + item.producer : ""}
              {" "}<span className="muted">{item.created_by}, {fmtDateTs(item.created_at, lang)}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function CategorySelect({ t, lang, value, onChange, distinctCategories }) {
  const cats = [...CATEGORY_OPTS];
  distinctCategories.forEach((c) => { if (!cats.find((o) => o.key === c)) cats.push({ key: c, de: c, en: c }); });
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{t("allCategories")}</option>
      {cats.map((c) => <option key={c.key} value={c.key}>{lang === "en" ? c.en : c.de}</option>)}
    </select>
  );
}

function Products({ t, lang, products, productFilter, setProductFilter, categoryFilter, setCategoryFilter, distinctCategories, openOffersFor, openRequestsFor, setActiveProductId, setShowProductForm, isFavorite, toggleFavorite, favoritesOnly, setFavoritesOnly }) {
  const q = productFilter.toLowerCase();
  const filtered = products.filter((p) => {
    const matchQ = !q || (p.sku || "").toLowerCase().includes(q) || (p.name_de || "").toLowerCase().includes(q) || (p.name_en || "").toLowerCase().includes(q);
    const matchCat = !categoryFilter || p.category === categoryFilter;
    const matchFav = !favoritesOnly || isFavorite(p.id);
    return matchQ && matchCat && matchFav;
  });
  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ margin: 0 }}>{t("products")} ({products.length})</h2>
        <button className="btn" onClick={() => setShowProductForm(true)}>{t("newProduct")}</button>
      </div>
      <div className="search-bar" style={{ marginTop: 14 }}>
        <input placeholder={t("searchProduct")} value={productFilter} onChange={(e) => setProductFilter(e.target.value)} />
        <CategorySelect t={t} lang={lang} value={categoryFilter} onChange={setCategoryFilter} distinctCategories={distinctCategories} />
        <label style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
          <input type="checkbox" style={{ width: "auto" }} checked={favoritesOnly} onChange={(e) => setFavoritesOnly(e.target.checked)} /> ⭐ {t("favoritesOnly")}
        </label>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr>
            <th></th><th>{t("colSku")}</th><th>{t("colCategory")}</th><th>{t("colNameDe")}</th><th>{t("colNameEn")}</th>
            <th>{t("colPackaging")}</th><th>{t("colPallet")}</th><th>{t("colCerts")}</th><th>{t("colOpenOffers")}</th><th>{t("colOpenRequests")}</th>
          </tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={10}><div className="empty-state">{t("noProductsFound")}</div></td></tr>}
            {filtered.map((p) => (
              <tr key={p.id}>
                <td>
                  <button className="btn small secondary" title={isFavorite(p.id) ? t("removeFavorite") : t("addFavorite")} onClick={(e) => { e.stopPropagation(); toggleFavorite(p.id); }}>
                    {isFavorite(p.id) ? "⭐" : "☆"}
                  </button>
                </td>
                <td className="product-row" onClick={() => setActiveProductId(p.id)}>{p.sku}</td>
                <td><span className="badge cat">{categoryLabel(p.category, lang)}</span></td>
                <td className="product-link" onClick={() => setActiveProductId(p.id)}>{p.name_de}</td>
                <td>{p.name_en}</td>
                <td>{optLabel(PACKAGING_OPTS, p.packaging, lang)}</td>
                <td>{optLabel(PALLET_OPTS, p.pallet, lang)}</td>
                <td>{(p.certifications || []).map((c) => <span key={c} className="chip">{optLabel(CERT_OPTS, c, lang)}</span>)}</td>
                <td>{openOffersFor(p.id).length}</td>
                <td>{openRequestsFor(p.id).length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OffersOverview({ t, lang, products, productFilter, setProductFilter, categoryFilter, setCategoryFilter, distinctCategories, openOffersFor, bestOfferFor, setActiveProductId, setEntryForm, canOffer, fmtMoney, unitLabel }) {
  const q = productFilter.toLowerCase();
  const filtered = products.filter((p) => {
    const matchQ = !q || (p.sku || "").toLowerCase().includes(q) || (p.name_de || "").toLowerCase().includes(q) || (p.name_en || "").toLowerCase().includes(q);
    const matchCat = !categoryFilter || p.category === categoryFilter;
    return matchQ && matchCat;
  });
  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ margin: 0 }}>{t("products")} ({products.length})</h2>
        {canOffer && <button className="btn" onClick={() => setEntryForm({ type: "offer", presetProductId: null })}>{t("newOffer")}</button>}
      </div>
      <div className="search-bar" style={{ marginTop: 14 }}>
        <input placeholder={t("searchProduct")} value={productFilter} onChange={(e) => setProductFilter(e.target.value)} />
        <CategorySelect t={t} lang={lang} value={categoryFilter} onChange={setCategoryFilter} distinctCategories={distinctCategories} />
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>{t("colSku")}</th><th>{t("colCategory")}</th><th>{t("colNameDe")}</th><th>{t("colNameEn")}</th><th>{t("colOpenOffers")}</th><th>{t("colBestOffer")}</th>
          </tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={6}><div className="empty-state">{t("noProductsFound")}</div></td></tr>}
            {filtered.map((p) => {
              const best = bestOfferFor(p.id);
              return (
                <tr key={p.id} className="product-row" onClick={() => setActiveProductId(p.id)}>
                  <td>{p.sku}</td>
                  <td><span className="badge cat">{categoryLabel(p.category, lang)}</span></td>
                  <td className="product-link">{p.name_de}</td>
                  <td>{p.name_en}</td>
                  <td>{openOffersFor(p.id).length}</td>
                  <td>{best ? <span className="badge best">{fmtMoney(best.price, lang)} / {unitLabel(best.unit, lang)}</span> : <span className="muted">{t("noActiveOffer")}</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Market({ t, lang, products, marketFilter, setMarketFilter, categoryFilter, setCategoryFilter, distinctCategories, marketSort, setMarketSort, offers, suppliers, marketSupplierFilter, setMarketSupplierFilter, openRequestsFor, daysUntilIso, fmtDateIso, fmtMoney, unitLabel, setActiveProductId, canRequest, currentUser, setContactItem, isFavorite, toggleFavorite, favoritesOnly, setFavoritesOnly }) {
  const q = marketFilter.toLowerCase();
  function bestFilteredOffer(pid) {
    const list = offers.filter((o) => o.status === "open" && o.product_id === pid && (!marketSupplierFilter || o.supplier_id === marketSupplierFilter));
    return [...list].sort((a, b) => a.price - b.price)[0] || null;
  }
  let rows = products.filter((p) => {
    const matchQ = !q || (p.sku || "").toLowerCase().includes(q) || (p.name_de || "").toLowerCase().includes(q);
    const matchCat = !categoryFilter || p.category === categoryFilter;
    const matchFav = !favoritesOnly || isFavorite(p.id);
    return matchQ && matchCat && matchFav;
  }).map((p) => ({ p, best: bestFilteredOffer(p.id), reqCount: openRequestsFor(p.id).length }));
  if (marketSort === "price_asc") rows.sort((a, b) => (a.best ? a.best.price : Infinity) - (b.best ? b.best.price : Infinity));
  if (marketSort === "price_desc") rows.sort((a, b) => (b.best ? b.best.price : -Infinity) - (a.best ? a.best.price : -Infinity));
  if (marketSort === "requests") rows.sort((a, b) => b.reqCount - a.reqCount);

  return (
    <div className="card">
      <h2>{t("marketTitle")}</h2>
      <p className="muted">{t("marketDesc")}</p>
      <div className="search-bar">
        <input placeholder={t("searchProductPlaceholder")} value={marketFilter} onChange={(e) => setMarketFilter(e.target.value)} />
        <CategorySelect t={t} lang={lang} value={categoryFilter} onChange={setCategoryFilter} distinctCategories={distinctCategories} />
        <select value={marketSort} onChange={(e) => setMarketSort(e.target.value)}>
          <option value="price_asc">{t("sortPriceAsc")}</option>
          <option value="price_desc">{t("sortPriceDesc")}</option>
          <option value="requests">{t("sortRequests")}</option>
        </select>
        <select value={marketSupplierFilter} onChange={(e) => setMarketSupplierFilter(e.target.value)}>
          <option value="">{t("allSuppliers")}</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
          <input type="checkbox" style={{ width: "auto" }} checked={favoritesOnly} onChange={(e) => setFavoritesOnly(e.target.checked)} /> ⭐ {t("favoritesOnly")}
        </label>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr>
            <th></th><th>{t("colProduct")}</th><th>{t("colCategory")}</th><th>{t("colBestOffer")}</th><th>{t("colQty")}</th>
            <th>{t("colValidUntil")}</th><th>{t("colOrigin")}</th><th>{t("colProducer")}</th><th>{t("colSupplier")}</th><th></th>
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={10}><div className="empty-state">{t("noProductsFoundGeneric")}</div></td></tr>}
            {rows.map((r) => {
              const expSoon = r.best && r.best.valid_until && daysUntilIso(r.best.valid_until) <= 5;
              const canContact = r.best && canRequest && r.best.creator_id !== currentUser.id;
              return (
                <tr key={r.p.id}>
                  <td>
                    <button className="btn small secondary" title={isFavorite(r.p.id) ? t("removeFavorite") : t("addFavorite")} onClick={() => toggleFavorite(r.p.id)}>
                      {isFavorite(r.p.id) ? "⭐" : "☆"}
                    </button>
                  </td>
                  <td className="product-link" onClick={() => setActiveProductId(r.p.id)}>{productLabel(r.p, lang)}</td>
                  <td><span className="badge cat">{categoryLabel(r.p.category, lang)}</span></td>
                  <td>{r.best ? <span className="badge best">{fmtMoney(r.best.price, lang)} / {unitLabel(r.best.unit, lang)}</span> : <span className="muted">{t("noActiveOffer")}</span>}</td>
                  <td>{r.best ? `${r.best.quantity} ${unitLabel(r.best.unit, lang)}` : "–"}</td>
                  <td>{r.best ? <span className={`badge ${expSoon ? "soon" : ""}`}>{fmtDateIso(r.best.valid_until, lang)}</span> : "–"}</td>
                  <td>{r.best ? (r.best.origin_country || "–") : "–"}</td>
                  <td>{r.best ? (r.best.producer || "–") : "–"}</td>
                  <td>{r.best ? r.best.created_by : "–"}</td>
                  <td>
                    <button className="btn small secondary" onClick={() => setActiveProductId(r.p.id)}>{t("colDetails")}</button>
                    {canContact && <button className="btn small info" style={{ marginLeft: 4 }} onClick={() => setContactItem({ item: r.best, itemType: "offer" })}>✉</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FlatList({ t, lang, isOffers, items, sortKey, setSortKey, productById, unitLabel, fmtMoney, fmtDateIso, currentUser, canContact, setActiveProductId, setContactItem, canCreate, setEntryForm, filters, setFilters, suppliers, hideCreate, titleOverride }) {
  const supplierById = (id) => (suppliers || []).find((s) => s.id === id);
  let list = items.filter((item) => {
    const dateVal = isOffers ? item.valid_until : item.delivery_date;
    if (filters.producer && !(item.producer || "").toLowerCase().includes(filters.producer.toLowerCase())) return false;
    if (!isOffers && filters.origin && !(item.origin_country || "").toLowerCase().includes(filters.origin.toLowerCase())) return false;
    if (filters.priceMin && Number(item.price) < Number(filters.priceMin)) return false;
    if (filters.priceMax && Number(item.price) > Number(filters.priceMax)) return false;
    if (filters.deliveryFrom && (!dateVal || dateVal < filters.deliveryFrom)) return false;
    if (filters.deliveryTo && (!dateVal || dateVal > filters.deliveryTo)) return false;
    if (isOffers && filters.supplierId && item.supplier_id !== filters.supplierId) return false;
    return true;
  });
  if (sortKey === "newest") list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  if (sortKey === "price_asc") list.sort((a, b) => a.price - b.price);
  const anyFilterActive = Object.values(filters).some((v) => v);
  const resetFilters = () => setFilters(isOffers ? { producer: "", supplierId: "", priceMin: "", priceMax: "", deliveryFrom: "", deliveryTo: "" } : { producer: "", origin: "", priceMin: "", priceMax: "", deliveryFrom: "", deliveryTo: "" });

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ margin: 0 }}>{titleOverride || (isOffers ? t("offersTabTitle") : t("requestsTabTitle"))}</h2>
        {canCreate && !hideCreate && <button className="btn" onClick={() => setEntryForm({ type: isOffers ? "offer" : "request", presetProductId: null })}>{isOffers ? t("newOffer") : t("newRequest")}</button>}
      </div>
      <div className="search-bar">
        <select value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
          <option value="newest">{t("sortNewest")}</option>
          <option value="price_asc">{t("sortPriceAsc")}</option>
        </select>
        <input placeholder={t("filterProducer")} value={filters.producer} onChange={(e) => setFilters({ ...filters, producer: e.target.value })} />
        {!isOffers && <input placeholder={t("filterOrigin")} value={filters.origin} onChange={(e) => setFilters({ ...filters, origin: e.target.value })} />}
        {isOffers && (
          <select value={filters.supplierId} onChange={(e) => setFilters({ ...filters, supplierId: e.target.value })}>
            <option value="">{t("allSuppliers")}</option>
            {(suppliers || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
      </div>
      <div className="search-bar">
        <div style={{ display: "flex", gap: 6, alignItems: "center", flex: 1, minWidth: 220 }}>
          <span className="muted" style={{ whiteSpace: "nowrap" }}>{t("filterPriceMin")}</span>
          <input type="number" step="0.01" value={filters.priceMin} onChange={(e) => setFilters({ ...filters, priceMin: e.target.value })} />
          <span className="muted" style={{ whiteSpace: "nowrap" }}>{t("filterPriceMax")}</span>
          <input type="number" step="0.01" value={filters.priceMax} onChange={(e) => setFilters({ ...filters, priceMax: e.target.value })} />
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flex: 1, minWidth: 220 }}>
          <span className="muted" style={{ whiteSpace: "nowrap" }}>{t("filterDeliveryFrom")}</span>
          <input type="date" value={filters.deliveryFrom} onChange={(e) => setFilters({ ...filters, deliveryFrom: e.target.value })} />
          <span className="muted" style={{ whiteSpace: "nowrap" }}>{t("filterDeliveryTo")}</span>
          <input type="date" value={filters.deliveryTo} onChange={(e) => setFilters({ ...filters, deliveryTo: e.target.value })} />
        </div>
        {anyFilterActive && <button className="btn small secondary" onClick={resetFilters}>{t("resetFilters")}</button>}
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>{t("colProduct")}</th><th>{t("colQty")}</th><th>{t("colBestOffer")}</th>
            <th>{isOffers ? t("colValidUntil") : t("colDelivery")}</th><th>{t("colOrigin")}</th><th>{t("colProducer")}</th>
            {isOffers && <th>{t("filterSupplier")}</th>}
            {!isOffers && <th>{t("customerLabel")}</th>}
            <th>{t("colCreatedBy")}</th><th>{t("colStatus")}</th><th></th>
          </tr></thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={isOffers ? 10 : 10}><div className="empty-state">{t("noEntriesYet")}</div></td></tr>}
            {list.map((item) => {
              const p = productById(item.product_id);
              const dateVal = isOffers ? item.valid_until : item.delivery_date;
              const canC = item.status === "open" && canContact && item.creator_id !== currentUser.id;
              const sup = isOffers ? supplierById(item.supplier_id) : null;
              return (
                <tr key={item.id}>
                  <td className="product-link" onClick={() => setActiveProductId(item.product_id)}>{productLabel(p, lang)}</td>
                  <td>{item.quantity} {unitLabel(item.unit, lang)}</td>
                  <td>{fmtMoney(item.price, lang)}</td>
                  <td>{fmtDateIso(dateVal, lang)}</td>
                  <td>{item.origin_country || "–"}</td>
                  <td>{item.producer || "–"}</td>
                  {isOffers && <td>{sup ? sup.name : "–"}</td>}
                  {!isOffers && <td>{item.customer || "–"}</td>}
                  <td>{item.created_by}</td>
                  <td><span className={`badge ${item.status === "open" ? "" : item.status}`}>{t("status" + item.status.charAt(0).toUpperCase() + item.status.slice(1))}</span></td>
                  <td>{canC && <button className="btn small info" onClick={() => setContactItem({ item, itemType: isOffers ? "offer" : "request" })}>✉</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Mine({ t, lang, currentUser, requests, offers, productById, unitLabel, fmtMoney, fmtDateIso, markDone, reopenEntry, deleteEntry }) {
  const myReq = requests.filter((r) => r.creator_id === currentUser.id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const myOff = offers.filter((o) => o.creator_id === currentUser.id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  function Row({ item, table }) {
    const p = productById(item.product_id);
    const isRequest = table === "requests";
    const dateLabel = `${isRequest ? t("deliveryLabel") : t("validLabel")}: ${fmtDateIso(isRequest ? item.delivery_date : item.valid_until, lang)}`;
    return (
      <div className="card" style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div>
            <b>{productLabel(p, lang)}</b> <span className="muted">({p ? p.sku : ""})</span><br />
            <span className="muted">{item.quantity} {unitLabel(item.unit, lang)} @ {fmtMoney(item.price, lang)} · {dateLabel}</span><br />
            <span className="origin-line">{item.origin_country || ""}{item.producer ? " · " + item.producer : ""}</span>
            {item.comment && <div className="muted" style={{ marginTop: 4 }}>💬 {item.comment}</div>}
          </div>
          <span className={`badge ${item.status === "open" ? "" : item.status}`}>{t("status" + item.status.charAt(0).toUpperCase() + item.status.slice(1))}</span>
        </div>
        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {item.status === "open"
            ? <button className="btn small secondary" onClick={() => markDone(table, item.id)}>{t("markDone")}</button>
            : <button className="btn small secondary" onClick={() => reopenEntry(table, item.id)}>{t("reopen")}</button>}
          <button className="btn small danger" onClick={() => deleteEntry(table, item.id)}>{t("deleteBtn")}</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <h2>{t("mineReqTitle")}</h2>
      {myReq.length === 0 ? <div className="card empty-state">{t("noRequestsCreated")}</div> : myReq.map((r) => <Row key={r.id} item={r} table="requests" />)}
      <h2 style={{ marginTop: 24 }}>{t("mineOffTitle")}</h2>
      {myOff.length === 0 ? <div className="card empty-state">{t("noOffersCreated")}</div> : myOff.map((o) => <Row key={o.id} item={o} table="offers" />)}
    </>
  );
}

function TenderSection({ t, lang, tenders, requests, offers, customers, products, currentUser, canRequest, tenderView, setTenderView, selectedTenderId, setSelectedTenderId, createTender, setActiveProductId, setContactItem, unitLabel, fmtMoney, fmtDateIso, productById }) {
  function linesFor(tenderId) { return requests.filter((r) => r.tender_id === tenderId); }

  if (tenderView === "form") {
    return <TenderForm {...{ t, lang, customers, products, unitLabel, createTender, close: () => setTenderView("list") }} />;
  }

  if (tenderView === "detail" && selectedTenderId) {
    const tender = tenders.find((td) => td.id === selectedTenderId);
    if (!tender) { setTenderView("list"); return null; }
    const customer = customers.find((c) => c.id === tender.customer_id);
    const lines = linesFor(tender.id).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const doneCount = lines.filter((l) => l.status === "done").length;
    return (
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h2 style={{ marginBottom: 2 }}>{t("tenderDetailTitle")} {tender.title ? "– " + tender.title : ""}</h2>
            <div className="muted">{t("customerLabel")}: {customer ? customer.name : "?"} · {t("tenderListColCreatedBy")}: {tender.created_by} · {t("tenderProgress")}: {doneCount}/{lines.length}</div>
          </div>
          <button className="btn small secondary" onClick={() => { setTenderView("list"); setSelectedTenderId(null); }}>{t("backToList")}</button>
        </div>
        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table>
            <thead><tr>
              <th>{t("colProduct")}</th><th>{t("colQty")}</th><th>{t("colBestOffer")}</th><th>{t("colDelivery")}</th><th>{t("colStatus")}</th><th>{t("bestMatchLabel")}</th><th></th>
            </tr></thead>
            <tbody>
              {lines.map((line) => {
                const p = productById(line.product_id);
                const matches = matchingOffersFor(offers, line);
                const best = matches[0];
                return (
                  <tr key={line.id}>
                    <td className="product-link" onClick={() => setActiveProductId(line.product_id)}>{productLabel(p, lang)}</td>
                    <td>{line.quantity} {unitLabel(line.unit, lang)}</td>
                    <td>{fmtMoney(line.price, lang)}</td>
                    <td>{fmtDateIso(line.delivery_date, lang)}</td>
                    <td><span className={`badge ${line.status === "open" ? "" : line.status}`}>{t("status" + line.status.charAt(0).toUpperCase() + line.status.slice(1))}</span></td>
                    <td>{best ? <span className="badge best">{fmtMoney(best.price, lang)}</span> : <span className="muted">{t("noActiveOffer")}</span>}</td>
                    <td>{best && <button className="btn small info" onClick={() => setContactItem({ item: best, itemType: "offer" })}>{t("contactBtnOffer")}</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const rows = tenders.map((td) => {
    const customer = customers.find((c) => c.id === td.customer_id);
    const lines = linesFor(td.id);
    const doneCount = lines.filter((l) => l.status === "done").length;
    return { tender: td, customer, itemCount: lines.length, doneCount };
  });

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ margin: 0 }}>{t("tendersTitle")}</h2>
        {canRequest && <button className="btn" onClick={() => setTenderView("form")}>{t("newTender")}</button>}
      </div>
      <div className="table-wrap" style={{ marginTop: 14 }}>
        <table>
          <thead><tr>
            <th>{t("tenderListColCustomer")}</th><th>{t("tenderListColItems")}</th><th>{t("tenderListColMatched")}</th><th>{t("tenderListColCreatedBy")}</th><th>{t("tenderListColDate")}</th><th></th>
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6}><div className="empty-state">{t("noTendersYet")}</div></td></tr>}
            {rows.map(({ tender, customer, itemCount, doneCount }) => (
              <tr key={tender.id}>
                <td className="product-link" onClick={() => { setSelectedTenderId(tender.id); setTenderView("detail"); }}>{customer ? customer.name : "?"}{tender.title ? " – " + tender.title : ""}</td>
                <td>{itemCount}</td>
                <td>{doneCount}/{itemCount}</td>
                <td>{tender.created_by}</td>
                <td>{new Date(tender.created_at).toLocaleDateString(lang === "en" ? "en-GB" : "de-DE")}</td>
                <td><button className="btn small secondary" onClick={() => { setSelectedTenderId(tender.id); setTenderView("detail"); }}>{t("colDetails")}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TenderForm({ t, lang, customers, products, unitLabel, createTender, close }) {
  const [customerId, setCustomerId] = useState("");
  const [title, setTitle] = useState("");
  const [lines, setLines] = useState([{ productId: "", quantity: "", unit: UNITS[0], price: "", deliveryDate: "" }]);

  function updateLine(idx, patch) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  function addLine() { setLines((prev) => [...prev, { productId: "", quantity: "", unit: UNITS[0], price: "", deliveryDate: "" }]); }
  function removeLine(idx) { setLines((prev) => prev.filter((_, i) => i !== idx)); }

  function save() {
    const validLines = lines.filter((l) => l.productId && l.quantity && l.price && l.deliveryDate);
    if (!customerId || validLines.length === 0) { alert(t("fillTenderRequired")); return; }
    createTender({ customerId, title: title.trim(), lines });
    close();
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal wide">
        <h2>{t("newTenderTitle")}</h2>
        <div className="row">
          <div>
            <label>{t("tenderCustomerField")}</label>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">{t("choose")}</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.customer_number} – {c.name}</option>)}
            </select>
          </div>
          <div><label>{t("tenderTitleField")}</label><input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        </div>
        <h3 style={{ marginTop: 18 }}>{t("requestsSection")}</h3>
        {lines.map((line, idx) => (
          <div key={idx} className="row" style={{ alignItems: "flex-end", borderBottom: "1px solid var(--border)", paddingBottom: 10, marginBottom: 4 }}>
            <div style={{ flex: 2, minWidth: 180 }}>
              <label>{t("tenderLineProduct")}</label>
              <select value={line.productId} onChange={(e) => updateLine(idx, { productId: e.target.value })}>
                <option value="">{t("choose")}</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.sku} – {productLabel(p, lang)}</option>)}
              </select>
            </div>
            <div>
              <label>{t("tenderLineQty")}</label>
              <input type="number" min="0" step="any" value={line.quantity} onChange={(e) => updateLine(idx, { quantity: e.target.value })} />
            </div>
            <div>
              <label>{t("unit")}</label>
              <select value={line.unit} onChange={(e) => updateLine(idx, { unit: e.target.value })}>
                {UNITS.map((u) => <option key={u} value={u}>{unitLabel(u, lang)}</option>)}
              </select>
            </div>
            <div>
              <label>{t("tenderLinePrice")}</label>
              <input type="number" min="0" step="0.01" value={line.price} onChange={(e) => updateLine(idx, { price: e.target.value })} />
            </div>
            <div>
              <label>{t("tenderLineDelivery")}</label>
              <input type="date" value={line.deliveryDate} onChange={(e) => updateLine(idx, { deliveryDate: e.target.value })} />
            </div>
            <div style={{ flex: "0 0 auto" }}>
              {lines.length > 1 && <button type="button" className="btn small danger" onClick={() => removeLine(idx)}>{t("removeTenderLine")}</button>}
            </div>
          </div>
        ))}
        <button type="button" className="btn small secondary" onClick={addLine}>{t("addTenderLine")}</button>
        <div className="modal-actions">
          <button className="btn secondary" onClick={close}>{t("cancel")}</button>
          <button className="btn" onClick={save}>{t("saveTender")}</button>
        </div>
      </div>
    </div>
  );
}

function Customers({ t, lang, requests, customers, currentUser, productById, unitLabel, fmtMoney, fmtDateIso, setActiveProductId, createCustomer, setShowCustomerForm }) {
  const [sub, setSub] = useState("list");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");

  function statusBadge(status) {
    const label = t("status" + status.charAt(0).toUpperCase() + status.slice(1));
    return <span className={`badge ${status === "open" ? "" : status}`}>{label}</span>;
  }

  // Historie: primär nach customer_id gruppiert; alte Freitext-Einträge (ohne Kundennummer) separat als Legacy-Gruppe.
  const grouped = {};
  requests.forEach((r) => {
    let key, label;
    if (r.customer_id) { key = r.customer_id; label = null; }
    else if (r.customer && r.customer.trim()) { key = "legacy:" + r.customer.trim(); label = r.customer.trim() + " " + t("legacyCustomer"); }
    else return;
    if (!grouped[key]) grouped[key] = { label, items: [] };
    grouped[key].items.push(r);
  });
  Object.keys(grouped).forEach((key) => {
    if (!grouped[key].label) {
      const cust = customers.find((c) => c.id === key);
      grouped[key].label = cust ? `${cust.customer_number} – ${cust.name}` : key;
    }
  });
  const groupKeys = Object.keys(grouped).sort((a, b) => grouped[a].label.localeCompare(grouped[b].label));
  const selectedRows = selectedCustomerId ? (grouped[selectedCustomerId] ? grouped[selectedCustomerId].items : []) : [];
  const sortedSelectedRows = [...selectedRows].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return (
    <>
      <div className="card">
        <h2>{t("customersTitle")}</h2>
        <p className="muted">{t("customersDesc")}</p>
        <nav className="tabs" style={{ marginBottom: 14, borderRadius: 8, overflow: "hidden" }}>
          <button className={sub === "list" ? "active" : ""} onClick={() => setSub("list")}>{t("customersSubList")}</button>
          <button className={sub === "history" ? "active" : ""} onClick={() => setSub("history")}>{t("customersSubHistory")}</button>
        </nav>

        {sub === "list" && (
          <>
            <div style={{ marginBottom: 10 }}><button className="btn" onClick={() => setShowCustomerForm(true)}>{t("newCustomer")}</button></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>{t("colCustomerNumber")}</th><th>{t("customerNameField").replace(" *","")}</th><th>{t("colPostalCode")}</th><th>{t("colSalesRep")}</th></tr></thead>
                <tbody>
                  {customers.length === 0 && <tr><td colSpan={4}><div className="empty-state">{t("noCustomersYet")}</div></td></tr>}
                  {customers.map((c) => (
                    <tr key={c.id}>
                      <td>{c.customer_number}</td><td>{c.name}</td><td>{c.postal_code}</td><td>{c.sales_rep_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {sub === "history" && (
          <div className="search-bar">
            <select value={selectedCustomerId} onChange={(e) => setSelectedCustomerId(e.target.value)}>
              <option value="">{t("allCustomersOverview")}</option>
              {groupKeys.map((k) => <option key={k} value={k}>{grouped[k].label} ({grouped[k].items.length})</option>)}
            </select>
          </div>
        )}

        {sub === "history" && !selectedCustomerId && (
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>{t("customerLabel")}</th><th>{t("customerColRequests")}</th><th>{t("customerColOpen")}</th><th>{t("customerColDone")}</th><th>{t("customerColArchived")}</th>
              </tr></thead>
              <tbody>
                {groupKeys.length === 0 && <tr><td colSpan={5}><div className="empty-state">{t("noEntriesYet")}</div></td></tr>}
                {groupKeys.map((k) => {
                  const items = grouped[k].items;
                  const open = items.filter((r) => r.status === "open").length;
                  const done = items.filter((r) => r.status === "done").length;
                  const archived = items.filter((r) => r.status === "archived").length;
                  return (
                    <tr key={k}>
                      <td className="product-link" onClick={() => setSelectedCustomerId(k)}>{grouped[k].label}</td>
                      <td>{items.length}</td><td>{open}</td><td>{done}</td><td>{archived}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {sub === "history" && selectedCustomerId && (
        <div className="card">
          <h3>{grouped[selectedCustomerId].label} — {sortedSelectedRows.length} {t("entriesFound")}</h3>
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>{t("colProduct")}</th><th>{t("colQty")}</th><th>{t("colBestOffer")}</th><th>{t("colDelivery")}</th><th>{t("colStatus")}</th><th>{t("colComment")}</th>
              </tr></thead>
              <tbody>
                {sortedSelectedRows.map((r) => {
                  const p = productById(r.product_id);
                  return (
                    <tr key={r.id}>
                      <td className="product-link" onClick={() => setActiveProductId(r.product_id)}>{productLabel(p, lang)}</td>
                      <td>{r.quantity} {unitLabel(r.unit, lang)}</td>
                      <td>{fmtMoney(r.price, lang)}</td>
                      <td>{fmtDateIso(r.delivery_date, lang)}</td>
                      <td>{statusBadge(r.status)}<div className="muted" style={{ fontSize: "0.7rem" }}>{r.status === "done" ? t("purchased") : t("notPurchased")}</div></td>
                      <td>{r.comment || "–"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function CustomerForm({ t, lang, close, createCustomer }) {
  const [customerNumber, setCustomerNumber] = useState("");
  const [name, setName] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const salesReps = EMPLOYEES.filter((e) => e.role === "sales" || e.role === "manager");
  const [salesRepId, setSalesRepId] = useState(salesReps[0] ? salesReps[0].id : "");

  function save() {
    if (!customerNumber.trim() || !name.trim() || !postalCode.trim() || !salesRepId) { alert(t("fillCustomerRequired")); return; }
    createCustomer({ customerNumber: customerNumber.trim(), name: name.trim(), postalCode: postalCode.trim(), salesRepId });
    close();
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal">
        <h2>{t("newCustomerTitle")}</h2>
        <label>{t("customerNumberField")}</label><input value={customerNumber} onChange={(e) => setCustomerNumber(e.target.value)} />
        <label>{t("customerNameField")}</label><input value={name} onChange={(e) => setName(e.target.value)} />
        <label>{t("postalCodeField")}</label><input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} maxLength={5} placeholder="z.B. 48143" />
        <label>{t("salesRepField")}</label>
        <select value={salesRepId} onChange={(e) => setSalesRepId(e.target.value)}>
          {salesReps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <div className="modal-actions">
          <button className="btn secondary" onClick={close}>{t("cancel")}</button>
          <button className="btn" onClick={save}>{t("saveCustomer")}</button>
        </div>
      </div>
    </div>
  );
}

function SupplierForm({ t, lang, close, createSupplier }) {
  const [supplierNumber, setSupplierNumber] = useState("");
  const [name, setName] = useState("");
  const purchasers = EMPLOYEES.filter((e) => e.role === "purchasing" || e.role === "manager");
  const [supervisorId, setSupervisorId] = useState(purchasers[0] ? purchasers[0].id : "");

  function save() {
    if (!name.trim() || !supervisorId) { alert(t("fillSupplierRequired")); return; }
    createSupplier({ supplierNumber: supplierNumber.trim(), name: name.trim(), supervisorId });
    close();
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal">
        <h2>{t("newSupplierTitle")}</h2>
        <label>{t("supplierNumberField")}</label><input value={supplierNumber} onChange={(e) => setSupplierNumber(e.target.value)} />
        <label>{t("supplierNameField")}</label><input value={name} onChange={(e) => setName(e.target.value)} />
        <label>{t("supplierSupervisorField")}</label>
        <select value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)}>
          {purchasers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <div className="modal-actions">
          <button className="btn secondary" onClick={close}>{t("cancel")}</button>
          <button className="btn" onClick={save}>{t("saveSupplier")}</button>
        </div>
      </div>
    </div>
  );
}

function Suppliers({ t, lang, suppliers, setShowSupplierForm }) {
  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ margin: 0 }}>{t("suppliersTitle")} ({suppliers.length})</h2>
        <button className="btn" onClick={() => setShowSupplierForm(true)}>{t("newSupplier")}</button>
      </div>
      <div className="table-wrap" style={{ marginTop: 14 }}>
        <table>
          <thead><tr><th>{t("colSupplierNumber")}</th><th>{t("colSupplierName")}</th><th>{t("colSupervisor")}</th></tr></thead>
          <tbody>
            {suppliers.length === 0 && <tr><td colSpan={3}><div className="empty-state">{t("noSuppliersYet")}</div></td></tr>}
            {suppliers.map((s) => (
              <tr key={s.id}>
                <td>{s.supplier_number || "–"}</td><td>{s.name}</td><td>{s.supervisor_name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


function Archive({ t, lang, products, archiveProduct, setArchiveProduct, archiveType, setArchiveType, archiveFrom, setArchiveFrom, archiveTo, setArchiveTo, getArchiveCombined, productById, unitLabel, fmtMoney, fmtDateIso, exportArchiveCsv }) {
  const combined = getArchiveCombined();
  const prices = combined.map((i) => i.price).filter((n) => !isNaN(n));
  const min = prices.length ? Math.min(...prices) : null;
  const max = prices.length ? Math.max(...prices) : null;
  const avg = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null;
  const qtySum = combined.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
  const vwap = qtySum > 0 ? combined.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.quantity) || 0), 0) / qtySum : null;

  return (
    <div className="card">
      <h2>{t("archiveTitle")}</h2>
      <p className="muted">{t("archiveDesc")}</p>
      <div className="row">
        <div>
          <label>{t("filterProduct")}</label>
          <select value={archiveProduct} onChange={(e) => setArchiveProduct(e.target.value)}>
            <option value="">{t("allProducts")}</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.sku} – {productLabel(p, lang)}</option>)}
          </select>
        </div>
        <div>
          <label>{t("filterType")}</label>
          <select value={archiveType} onChange={(e) => setArchiveType(e.target.value)}>
            <option value="all">{t("allTypes")}</option>
            <option value="offers">{t("tabOffers")}</option>
            <option value="requests">{t("tabRequests")}</option>
          </select>
        </div>
        <div><label>{t("from")}</label><input type="date" value={archiveFrom} onChange={(e) => setArchiveFrom(e.target.value)} /></div>
        <div><label>{t("to")}</label><input type="date" value={archiveTo} onChange={(e) => setArchiveTo(e.target.value)} /></div>
      </div>
      <div className="stats-line">
        <div>{combined.length} {t("entriesFound")}</div>
        {min !== null && <div>{t("minPrice")}: <b>{fmtMoney(min, lang)}</b></div>}
        {max !== null && <div>{t("maxPrice")}: <b>{fmtMoney(max, lang)}</b></div>}
        {avg !== null && <div>{t("avgPrice")}: <b>{fmtMoney(avg, lang)}</b></div>}
        {vwap !== null && <div>{t("vwapPrice")}: <b>{fmtMoney(vwap, lang)}</b></div>}
      </div>
      <button className="btn" disabled={combined.length === 0} onClick={exportArchiveCsv}>{t("exportCsv")}</button>
      <div className="table-wrap" style={{ marginTop: 14 }}>
        <table>
          <thead><tr>
            <th>{t("colProduct")}</th><th>{t("colType")}</th><th>{t("colQty")}</th><th>{t("colBestOffer")}</th><th>{t("colOrigin")}</th>
            <th>{t("colProducer")}</th><th>{t("colCreatedBy")}</th><th>{t("colRefDate")}</th><th>{t("colStatus")}</th>
          </tr></thead>
          <tbody>
            {combined.length === 0 && <tr><td colSpan={9}><div className="empty-state">{t("noArchivedEntries")}</div></td></tr>}
            {combined.map((item) => {
              const p = productById(item.product_id);
              const isOffer = item._type === "offer";
              return (
                <tr key={item._type + item.id}>
                  <td>{productLabel(p, lang)}</td>
                  <td><span className={`badge ${item._type === "request" ? "role-sales" : "role-purchasing"}`}>{item._type === "request" ? t("sales") : t("purchasing")}</span></td>
                  <td>{item.quantity} {unitLabel(item.unit, lang)}</td>
                  <td>{fmtMoney(item.price, lang)}</td>
                  <td>{item.origin_country || "–"}</td>
                  <td>{item.producer || "–"}</td>
                  <td>{item.created_by}</td>
                  <td>{fmtDateIso(isOffer ? item.valid_until : item.delivery_date, lang)}</td>
                  <td><span className={`badge ${item.status}`}>{t("status" + item.status.charAt(0).toUpperCase() + item.status.slice(1))}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PriceTrendChart({ t, lang, offersHistory, requestsHistory, fmtMoney }) {
  const allPoints = [
    ...offersHistory.map((o) => ({ date: o.created_at, price: Number(o.price) })),
    ...requestsHistory.map((r) => ({ date: r.created_at, price: Number(r.price) })),
  ];
  if (allPoints.length === 0) {
    return <div className="muted" style={{ padding: "12px 0" }}>{t("noPriceHistory")}</div>;
  }
  const dates = allPoints.map((p) => new Date(p.date).getTime());
  const minDate = Math.min(...dates), maxDate = Math.max(...dates);
  const prices = allPoints.map((p) => p.price);
  let minPrice = Math.min(...prices), maxPrice = Math.max(...prices);
  if (minPrice === maxPrice) { minPrice -= 1; maxPrice += 1; }
  const priceRange = maxPrice - minPrice;
  const dateRange = maxDate - minDate || 1;
  const W = 640, H = 220, padL = 55, padR = 16, padT = 16, padB = 28;
  const x = (d) => padL + ((new Date(d).getTime() - minDate) / dateRange) * (W - padL - padR);
  const y = (p) => H - padB - ((p - minPrice) / priceRange) * (H - padT - padB);

  function buildSeries(points) {
    return [...points].sort((a, b) => new Date(a.date) - new Date(b.date));
  }
  function pathFor(points) {
    const sorted = buildSeries(points);
    if (sorted.length === 0) return "";
    return sorted.map((p, i) => (i === 0 ? "M" : "L") + x(p.date).toFixed(1) + "," + y(p.price).toFixed(1)).join(" ");
  }
  const offersSorted = buildSeries(offersHistory.map((o) => ({ date: o.created_at, price: Number(o.price) })));
  const requestsSorted = buildSeries(requestsHistory.map((r) => ({ date: r.created_at, price: Number(r.price) })));
  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: W, height: "auto" }}>
        {gridLines.map((g) => {
          const py = padT + g * (H - padT - padB);
          const priceAt = maxPrice - g * priceRange;
          return (
            <g key={g}>
              <line x1={padL} x2={W - padR} y1={py} y2={py} stroke="var(--border)" strokeWidth="1" />
              <text x={padL - 6} y={py + 4} fontSize="9" textAnchor="end" fill="var(--text-muted)">{priceAt.toFixed(2)}</text>
            </g>
          );
        })}
        <text x={padL} y={H - 6} fontSize="9" fill="var(--text-muted)">{new Date(minDate).toLocaleDateString(lang === "en" ? "en-GB" : "de-DE")}</text>
        <text x={W - padR} y={H - 6} fontSize="9" textAnchor="end" fill="var(--text-muted)">{new Date(maxDate).toLocaleDateString(lang === "en" ? "en-GB" : "de-DE")}</text>

        {offersSorted.length > 0 && <path d={pathFor(offersHistory.map((o) => ({ date: o.created_at, price: Number(o.price) })))} fill="none" stroke="var(--green)" strokeWidth="2" />}
        {offersSorted.map((p, i) => <circle key={"o" + i} cx={x(p.date)} cy={y(p.price)} r="3" fill="var(--green)" />)}

        {requestsSorted.length > 0 && <path d={pathFor(requestsHistory.map((r) => ({ date: r.created_at, price: Number(r.price) })))} fill="none" stroke="var(--info)" strokeWidth="2" strokeDasharray="4 3" />}
        {requestsSorted.map((p, i) => <circle key={"r" + i} cx={x(p.date)} cy={y(p.price)} r="3" fill="var(--info)" />)}
      </svg>
      <div style={{ display: "flex", gap: 16, marginTop: 6, fontSize: "0.78rem" }}>
        <span><span style={{ display: "inline-block", width: 12, height: 3, background: "var(--green)", marginRight: 5, verticalAlign: "middle" }}></span>{t("seriesOffers")}</span>
        <span><span style={{ display: "inline-block", width: 12, height: 3, background: "var(--info)", marginRight: 5, verticalAlign: "middle" }}></span>{t("seriesRequests")}</span>
      </div>
    </div>
  );
}

function ProductModal({ t, lang, product, currentUser, openRequestsFor, openOffersFor, close, unitLabel, fmtMoney, fmtDateIso, daysUntilIso, markDone, canRequest, canOffer, setEntryForm, activeProductId, setContactItem, isFavorite, toggleFavorite, priceHistoryFor }) {
  if (!product) return null;
  const reqs = openRequestsFor(product.id);
  const offs = openOffersFor(product.id);
  const { offersHistory, requestsHistory } = priceHistoryFor(product.id, 60);
  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal wide">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 style={{ marginBottom: 2 }}>
              <button className="btn small secondary" style={{ marginRight: 8 }} title={isFavorite(product.id) ? t("removeFavorite") : t("addFavorite")} onClick={() => toggleFavorite(product.id)}>
                {isFavorite(product.id) ? "⭐" : "☆"}
              </button>
              {product.name_de} <span className="badge cat">{categoryLabel(product.category, lang)}</span>
            </h2>
            <div className="muted">{product.name_en} · {product.sku}</div>
          </div>
          <button className="btn small secondary" onClick={close}>{t("close")}</button>
        </div>
        <div style={{ marginTop: 10 }} className="muted">{t("vpe")}: {optLabel(PACKAGING_OPTS, product.packaging, lang)} · {t("pallet")}: {optLabel(PALLET_OPTS, product.pallet, lang)}</div>
        <div style={{ marginTop: 6 }}>{(product.certifications || []).map((c) => <span key={c} className="chip">{optLabel(CERT_OPTS, c, lang)}</span>)}</div>

        <h3 style={{ marginTop: 18 }}>{t("priceTrendTitle")}</h3>
        <PriceTrendChart t={t} lang={lang} offersHistory={offersHistory} requestsHistory={requestsHistory} fmtMoney={fmtMoney} />

        <div className="two-col" style={{ marginTop: 18 }}>
          <div>
            <h3>{t("requestsSection")} — {reqs.length}</h3>
            {canRequest && <button className="btn small" onClick={() => setEntryForm({ type: "request", presetProductId: activeProductId })}>{t("newRequest")}</button>}
            <div style={{ marginTop: 10 }}>
              {reqs.length === 0 && <div className="muted">{t("noOpenRequests")}</div>}
              {reqs.map((r) => {
                const canDone = r.creator_id === currentUser.id || currentUser.role === "manager";
                const canContact = (currentUser.role === "purchasing" || currentUser.role === "manager") && r.creator_id !== currentUser.id;
                return (
                  <div key={r.id} className="entry-row">
                    <b>{r.quantity} {unitLabel(r.unit, lang)}</b> @ {fmtMoney(r.price, lang)}<br />
                    {t("deliveryLabel")}: {fmtDateIso(r.delivery_date, lang)}<br />
                    {r.customer && <>{t("customerLabel")}: <b>{r.customer}</b><br /></>}
                    <span className="origin-line">{r.origin_country || ""}{r.producer ? " · " + r.producer : ""}</span>
                    {r.comment && <><br /><span className="muted">💬 {r.comment}</span></>}
                    <br /><span className="muted">{r.created_by}</span>
                    {canDone && <> · <button className="btn small secondary" style={{ padding: "2px 8px" }} onClick={() => markDone("requests", r.id)}>{t("markDone")}</button></>}
                    {canContact && <> · <button className="btn small info" style={{ padding: "2px 8px" }} onClick={() => setContactItem({ item: r, itemType: "request" })}>{t("contactBtnRequest")}</button></>}
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <h3>{t("offersSection")} — {offs.length}</h3>
            {canOffer && <button className="btn small" onClick={() => setEntryForm({ type: "offer", presetProductId: activeProductId })}>{t("newOffer")}</button>}
            <div style={{ marginTop: 10 }}>
              {offs.length === 0 && <div className="muted">{t("noOpenOffers")}</div>}
              {offs.map((o, idx) => {
                const expSoon = o.valid_until && daysUntilIso(o.valid_until) <= 5;
                const canDone = o.creator_id === currentUser.id || currentUser.role === "manager";
                const canContact = (currentUser.role === "sales" || currentUser.role === "manager") && o.creator_id !== currentUser.id;
                return (
                  <div key={o.id} className="entry-row">
                    {idx === 0 && <span className="badge best">{t("bestOffer")}</span>}{" "}
                    <b>{o.quantity} {unitLabel(o.unit, lang)}</b> @ {fmtMoney(o.price, lang)}<br />
                    {t("validLabel")}: <span className={`badge ${expSoon ? "soon" : ""}`}>{fmtDateIso(o.valid_until, lang)}</span><br />
                    <span className="origin-line">{o.origin_country || ""}{o.producer ? " · " + o.producer : ""}</span>
                    {o.comment && <><br /><span className="muted">💬 {o.comment}</span></>}
                    <br /><span className="muted">{o.created_by}</span>
                    {canDone && <> · <button className="btn small secondary" style={{ padding: "2px 8px" }} onClick={() => markDone("offers", o.id)}>{t("markDone")}</button></>}
                    {canContact && <> · <button className="btn small info" style={{ padding: "2px 8px" }} onClick={() => setContactItem({ item: o, itemType: "offer" })}>{t("contactBtnOffer")}</button></>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MatchResultsModal({ t, lang, matchResults, unitLabel, fmtMoney, fmtDateIso, close, setContactItem }) {
  const { product, requestPrice, matches } = matchResults;
  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal wide">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 style={{ marginBottom: 2 }}>🎯 {t("matchResultsTitle")}</h2>
            <div className="muted">{productLabel(product, lang)} · {t("matchResultsDesc")} {fmtMoney(requestPrice, lang)}</div>
          </div>
          <button className="btn small secondary" onClick={close}>{t("close")}</button>
        </div>
        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table>
            <thead><tr>
              <th>{t("colQty")}</th><th>{t("colBestOffer")}</th><th>{t("colValidUntil")}</th><th>{t("colOrigin")}</th><th>{t("colProducer")}</th><th>{t("colSupplier")}</th><th></th>
            </tr></thead>
            <tbody>
              {matches.length === 0 && <tr><td colSpan={7}><div className="empty-state">{t("noMatchesInline")}</div></td></tr>}
              {matches.map((o, idx) => (
                <tr key={o.id}>
                  <td>{o.quantity} {unitLabel(o.unit, lang)}</td>
                  <td>{idx === 0 ? <span className="badge best">{fmtMoney(o.price, lang)}</span> : fmtMoney(o.price, lang)}</td>
                  <td>{fmtDateIso(o.valid_until, lang)}</td>
                  <td>{o.origin_country || "–"}</td>
                  <td>{o.producer || "–"}</td>
                  <td>{o.created_by}</td>
                  <td><button className="btn small info" onClick={() => { setContactItem({ item: o, itemType: "offer" }); close(); }}>{t("contactBtnOffer")}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ProductForm({ t, lang, close, createProduct }) {
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState("");
  const [nameDe, setNameDe] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [packaging, setPackaging] = useState(PACKAGING_OPTS[0].key);
  const [pallet, setPallet] = useState(PALLET_OPTS[0].key);
  const [certs, setCerts] = useState([]);
  const [customCert, setCustomCert] = useState("");

  function toggleCert(key) {
    setCerts((prev) => (prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key]));
  }
  function addCustomCert(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      const v = customCert.trim();
      if (v && !certs.includes(v)) setCerts((prev) => [...prev, v]);
      setCustomCert("");
    }
  }
  function save() {
    if (!sku.trim() || !nameDe.trim() || !nameEn.trim() || !category) { alert(t("fillRequired")); return; }
    createProduct({ sku: sku.trim(), nameDe: nameDe.trim(), nameEn: nameEn.trim(), category, packaging, pallet, certifications: certs });
    close();
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal">
        <h2>{t("newProductTitle")}</h2>
        <label>{t("sku")}</label><input value={sku} onChange={(e) => setSku(e.target.value)} />
        <label>{t("categoryField")}</label>
        <input list="categoryList" value={category} onChange={(e) => {
          const val = e.target.value;
          const opt = CATEGORY_OPTS.find((c) => c.de === val || c.en === val || c.key === val);
          setCategory(opt ? opt.key : val);
        }} />
        <datalist id="categoryList">{CATEGORY_OPTS.map((c) => <option key={c.key} value={lang === "en" ? c.en : c.de} />)}</datalist>
        <label>{t("nameDe")}</label><input value={nameDe} onChange={(e) => setNameDe(e.target.value)} />
        <label>{t("nameEn")}</label><input value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
        <label>{t("packaging")}</label>
        <select value={packaging} onChange={(e) => setPackaging(e.target.value)}>
          {PACKAGING_OPTS.map((o) => <option key={o.key} value={o.key}>{lang === "en" ? o.en : o.de}</option>)}
        </select>
        <label>{t("palletField")}</label>
        <select value={pallet} onChange={(e) => setPallet(e.target.value)}>
          {PALLET_OPTS.map((o) => <option key={o.key} value={o.key}>{lang === "en" ? o.en : o.de}</option>)}
        </select>
        <label>{t("certifications")}</label>
        <div>
          {CERT_OPTS.map((c) => (
            <button type="button" key={c.key} className="btn small secondary" style={{ margin: "2px 4px 2px 0" }} onClick={() => toggleCert(c.key)}>
              {certs.includes(c.key) ? "✓ " : "+ "}{lang === "en" ? c.en : c.de}
            </button>
          ))}
        </div>
        <input placeholder={t("ownCert")} style={{ marginTop: 8 }} value={customCert} onChange={(e) => setCustomCert(e.target.value)} onKeyDown={addCustomCert} />
        <div style={{ marginTop: 8 }}>
          {certs.filter((c) => !CERT_OPTS.find((o) => o.key === c)).map((c) => (
            <span key={c} className="chip">{c} <button onClick={() => toggleCert(c)}>×</button></span>
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn secondary" onClick={close}>{t("cancel")}</button>
          <button className="btn" onClick={save}>{t("saveProduct")}</button>
        </div>
      </div>
    </div>
  );
}

function EntryForm({ t, lang, type, presetProductId, products, customers, suppliers, close, createEntry, unitLabel }) {
  const isRequest = type === "request";
  const [productId, setProductId] = useState(presetProductId || "");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState(UNITS[0]);
  const [price, setPrice] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [date, setDate] = useState("");
  const [origin, setOrigin] = useState("");
  const [producer, setProducer] = useState("");
  const [comment, setComment] = useState("");
  const countryList = COUNTRY_OPTS[lang];

  function save() {
    if (!productId || !qty || !price || !date || (!isRequest && (!producer.trim() || !supplierId))) { alert(t("fillAllRequired")); return; }
    createEntry(type, { productId, quantity: qty, unit, price, date, originCountry: origin.trim(), producer: producer.trim(), comment: comment.trim(), customerId: customerId || null, supplierId: supplierId || null });
    close();
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal">
        <h2>{isRequest ? t("newRequestTitle") : t("newOfferTitle")}</h2>
        <label>{t("productField")}</label>
        <select value={productId} onChange={(e) => setProductId(e.target.value)}>
          <option value="">{t("choose")}</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.sku} – {productLabel(p, lang)}</option>)}
        </select>
        {isRequest && (
          <>
            <label>{t("customerNameOptional")}</label>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">{t("chooseCustomerOption")}</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.customer_number} – {c.name} ({c.postal_code})</option>)}
            </select>
          </>
        )}
        <div className="row">
          <div><label>{t("quantity")}</label><input type="number" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
          <div><label>{t("unit")}</label>
            <select value={unit} onChange={(e) => setUnit(e.target.value)}>
              {UNITS.map((uu) => <option key={uu} value={uu}>{unitLabel(uu, lang)}</option>)}
            </select>
          </div>
        </div>
        <div className="row">
          <div><label>{t("pricePerUnit")}</label><input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
          <div><label>{isRequest ? t("deliveryDateReq") : t("validUntilReq")}</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        </div>
        <div className="row">
          <div>
            <label>{t("originCountry")}</label>
            <input list="countryList" value={origin} onChange={(e) => setOrigin(e.target.value)} />
            <datalist id="countryList">{countryList.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div><label>{isRequest ? t("producerOpt") : t("producerReq")}</label><input value={producer} onChange={(e) => setProducer(e.target.value)} /></div>
        </div>
        {!isRequest && (
          <>
            <label>{t("supplierField")}</label>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">{t("chooseSupplierOption")}</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.supplier_number ? s.supplier_number + " – " : ""}{s.name}</option>)}
            </select>
          </>
        )}
        <label>{t("comment")}</label>
        <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
        <div className="modal-actions">
          <button className="btn secondary" onClick={close}>{t("cancel")}</button>
          <button className="btn" onClick={save}>{t("save")}</button>
        </div>
      </div>
    </div>
  );
}

function ContactModal({ t, lang, item, itemType, currentUser, buildEmailText, close, recordNotificationAndOpenMail, customers }) {
  const isOffer = itemType === "offer";
  const [emailLang, setEmailLang] = useState(lang);
  const [customer, setCustomer] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [deliveryQty, setDeliveryQty] = useState("");
  const [priceExpectation, setPriceExpectation] = useState("");
  const initialTxt = buildEmailText(emailLang, item, itemType, currentUser.name, {});
  const [to, setTo] = useState(item.creator_email || "");
  const [subject, setSubject] = useState(initialTxt.subject);
  const [body, setBody] = useState(initialTxt.body);
  const [bodyTouched, setBodyTouched] = useState(false);
  const [subjectTouched, setSubjectTouched] = useState(false);

  // Solange Betreff/Nachricht nicht von Hand bearbeitet wurden, bei jeder Änderung
  // der Sprache oder der Kundenanfrage-Felder automatisch neu zusammenfassen.
  useEffect(() => {
    const nego = { customer, deliveryDate, deliveryQty, priceExpectation };
    const newTxt = buildEmailText(emailLang, item, itemType, currentUser.name, nego);
    if (!subjectTouched) setSubject(newTxt.subject);
    if (!bodyTouched) setBody(newTxt.body);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailLang, customer, deliveryDate, deliveryQty, priceExpectation]);

  const nego = { customer, deliveryDate, deliveryQty, priceExpectation };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal">
        <h2>{t("contactModalTitle")}</h2>
        <label>{t("emailLang")}</label>
        <div className="langToggle" style={{ background: "var(--bg)", padding: 4, borderRadius: 8, display: "inline-flex" }}>
          <button className={`btn small ${emailLang === "de" ? "" : "secondary"}`} onClick={() => setEmailLang("de")}>DE</button>
          <button className={`btn small ${emailLang === "en" ? "" : "secondary"}`} onClick={() => setEmailLang("en")}>EN</button>
        </div>

        {isOffer && (
          <>
            <label style={{ marginTop: 16, fontWeight: 600 }}>{t("negoSectionTitle")}</label>
            <div className="row">
              <div><label>{t("customerLabel")}</label>
                <select value={customer} onChange={(e) => setCustomer(e.target.value)}>
                  <option value="">{t("chooseCustomerOption")}</option>
                  {customers.map((c) => <option key={c.id} value={c.name}>{c.customer_number} – {c.name}</option>)}
                </select>
              </div>
              <div><label>{t("requestedDelivery")}</label><input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} /></div>
            </div>
            <div className="row">
              <div><label>{t("requestedQty")} ({unitLabel(item.unit, lang)})</label><input type="number" min="0" step="any" value={deliveryQty} onChange={(e) => setDeliveryQty(e.target.value)} /></div>
              <div><label>{t("priceExpectationLabel")}</label><input type="number" min="0" step="0.01" value={priceExpectation} onChange={(e) => setPriceExpectation(e.target.value)} /></div>
            </div>
          </>
        )}

        <label style={{ marginTop: 16 }}>{t("mailTo")}</label><input value={to} onChange={(e) => setTo(e.target.value)} />
        <label>{t("subjectLabel")}</label><input value={subject} onChange={(e) => { setSubject(e.target.value); setSubjectTouched(true); }} />
        <label>{t("bodyLabel")}</label>
        <textarea rows={11} value={body} onChange={(e) => { setBody(e.target.value); setBodyTouched(true); }} />
        <div className="modal-actions">
          <button className="btn secondary" onClick={close}>{t("cancel")}</button>
          <button className="btn" onClick={() => { recordNotificationAndOpenMail(item, itemType, to, subject, body, nego); close(); }}>{t("openInMail")}</button>
        </div>
      </div>
    </div>
  );
}
