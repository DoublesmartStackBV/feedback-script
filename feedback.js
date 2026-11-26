/*
 * Doublesmart feedbacktool – feedback.js
 * Plaatsing op de klantsite:
 *   <script src="[url]/feedback.js?k=[publieke_sleutel]" async></script>
 * In de <head>, de <body> of via Google Tag Manager. De oude vorm met
 * data-klant="[publieke_sleutel]" werkt ook nog, maar niet via Tag Manager.
 *
 * Vaste regels: geen framework, geen cookies (alleen sessionStorage), en het
 * script mag de site nooit breken: bij elke fout stopt het stil.
 * Vier onderdelen (technisch ontwerp, hfst. 5; lofi v2):
 *   knop        tabje aan de zijkant, vraag klapt ernaast uit
 *   popup       na X sec op ingestelde pagina's, rechtsonder
 *   exit        alleen desktop, als de muis de bovenkant van de pagina verlaat
 *   na_aankoop  op de bedankpagina, in <div id="ds-feedback"></div> of als balk onderin
 */
(() => {
  "use strict";

  // Adressen van de Supabase-functies: online, en lokaal op de laptop
  const API_ONLINE = "https://xzzjwixozeeuhgatblnn.supabase.co/functions/v1";
  const API_LOKAAL = "http://127.0.0.1:55321/functions/v1";
  // Onthoudt per browsersessie of er al een vraag (pop-up, exit of na aankoop) getoond is
  const GETOOND = "ds-feedback-vraag-getoond";

  if (window.dsFeedbackGeladen) return; // script per ongeluk twee keer geplaatst
  window.dsFeedbackGeladen = true;

  const scriptTag =
    document.currentScript || document.querySelector('script[data-klant], script[src*="feedback.js?"]');

  // De sleutel van de klant staat in het scriptadres (feedback.js?k=...) of in
  // data-klant. Het adres blijft ook via Google Tag Manager heel; data-klant
  // haalt Tag Manager weg.
  const sleutel = (() => {
    try {
      return new URL(scriptTag.src).searchParams.get("k") || scriptTag.dataset.klant;
    } catch {
      return scriptTag && scriptTag.dataset.klant;
    }
  })();

  // Komt het script zelf van deze laptop (localhost), dan praat het met de
  // lokale Supabase; anders (bijv. GitHub Pages) met de online omgeving.
  // Zo is het bestand lokaal en online precies hetzelfde.
  const API = (() => {
    try {
      const host = new URL(scriptTag.src).hostname;
      return host === "localhost" || host === "127.0.0.1" ? API_LOKAAL : API_ONLINE;
    } catch {
      return API_ONLINE;
    }
  })();

  const veilig = (fn) => (...args) => {
    try {
      fn(...args);
    } catch {
      // stil stoppen: de site gaat altijd voor
    }
  };

  const vraagAlGetoond = () => {
    try {
      return sessionStorage.getItem(GETOOND) === "1";
    } catch {
      return true; // geen opslag mogelijk: liever niets tonen dan te vaak
    }
  };
  const markeerGetoond = () => {
    try {
      sessionStorage.setItem(GETOOND, "1");
    } catch {
      // geen opslag mogelijk, niet erg
    }
  };

  const apparaat = () =>
    matchMedia("(pointer: fine)").matches && innerWidth >= 768 ? "desktop" : "mobiel";

  // Eenvoudige wildcards: "/categorie/*" past op "/categorie/fietsen".
  // Een slash aan het eind telt niet mee: "/over-ons/" en "/over-ons" zijn dezelfde pagina.
  const zonderSlash = (pad) => (pad.length > 1 ? pad.replace(/\/+$/, "") : pad);
  const padPast = (patronen, pad) =>
    patronen.some((p) => {
      const delen = zonderSlash(p).split("*").map((d) => d.replace(/[.+?^${}()|[\]\\]/g, "\\$&"));
      return new RegExp("^" + delen.join(".*") + "$").test(zonderSlash(pad));
    });

  // Klein hulpje om HTML-elementen te maken (tekst altijd als tekst, nooit als HTML)
  function el(tag, attrs = {}, tekst) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (tekst != null) e.textContent = tekst;
    return e;
  }

  // Mond van de vijf smileys van de feedbackknop, van boos naar blij.
  // De kleur staat in de CSS (.s0 t/m .s4): grijs, en in kleur bij muis of keuze.
  const SMILEYS = [
    "M10 23 Q16 17 22 23",
    "M11 22 Q16 19.5 21 22",
    "M11 21 L21 21",
    "M11 20 Q16 22.5 21 20",
    "M10 19 Q16 25 22 19",
  ];

  // Tekent één smiley als SVG (met createElementNS, dus geen HTML-tekst nodig)
  function smiley(mond) {
    const svg = (tag, attrs) => {
      const e = document.createElementNS("http://www.w3.org/2000/svg", tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
      return e;
    };
    const tekening = svg("svg", { viewBox: "0 0 32 32", "aria-hidden": "true", focusable: "false" });
    tekening.append(
      svg("circle", { cx: "16", cy: "16", r: "14", fill: "#fff", stroke: "currentColor", "stroke-width": "2.5" }),
      svg("circle", { cx: "11", cy: "13", r: "1.8", fill: "currentColor" }),
      svg("circle", { cx: "21", cy: "13", r: "1.8", fill: "currentColor" }),
      svg("path", { d: mond, fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round" }),
    );
    return tekening;
  }

  function stuurAntwoord(sleutel, onderdeel, keuze, tekst, honeypot) {
    const body = JSON.stringify({
      k: sleutel,
      onderdeel_id: onderdeel.id,
      antwoord_keuze: keuze,
      antwoord_tekst: (tekst || "").trim().slice(0, 500) || null,
      paginapad: location.pathname,
      apparaat: apparaat(),
      website: honeypot || undefined,
    });
    // Exit: de bezoeker staat op het punt te gaan, sendBeacon komt ook dan nog aan
    if (onderdeel.type === "exit" && navigator.sendBeacon) {
      navigator.sendBeacon(`${API}/antwoord`, new Blob([body], { type: "text/plain" }));
      return;
    }
    // text/plain voorkomt een extra CORS-vooraanvraag
    fetch(`${API}/antwoord`, {
      method: "POST", keepalive: true, headers: { "Content-Type": "text/plain" }, body,
    }).catch(() => {});
  }

  // Shadow DOM: onze CSS raakt de site niet, en de CSS van de site raakt ons niet.
  // Het host-element zelf staat wel in de site; site-CSS die op alle elementen
  // werkt (bijv. "div { transform: ... }") zou de vaste plek van het tabje kunnen
  // verschuiven. Daarom krijgt de host eigen regels met voorrang.
  let stijlblad = null;
  function maakShadow(ouder) {
    const host = el("div", { class: "ds-feedback-host" });
    host.style.cssText = "all: initial !important; display: block !important;";
    ouder.appendChild(host);
    const root = host.attachShadow({ mode: "open" });
    // Bij voorkeur als "constructable stylesheet": die blokkeert een strenge
    // beveiligingsregel van de site (CSP zonder inline opmaak) niet.
    // Oudere browsers krijgen een gewoon <style>-blok.
    try {
      if (!stijlblad) {
        stijlblad = new CSSStyleSheet();
        stijlblad.replaceSync(CSS);
      }
      root.adoptedStyleSheets = [stijlblad];
    } catch {
      root.appendChild(el("style", {}, CSS));
    }
    return root;
  }

  // Gekozen maar niet verstuurd: zo'n keuze telt toch mee. Sluit de bezoeker de
  // vraag (×, Esc, klik ernaast, andere vraag) of verlaat hij de pagina zonder op
  // Versturen te drukken, dan versturen we alsnog de keuze. Getypte tekst gaat dan
  // bewust niet mee: die heeft de bezoeker niet zelf verstuurd.
  // Zonder dit vallen de cijfers te positief uit: wie "Nee" kiest en geen zin heeft
  // in de vervolgvraag, zou anders niet meetellen (ontwerpkeuze #26).
  const openstaand = new Set();
  addEventListener("pagehide", veilig(() => openstaand.forEach((afronden) => afronden())));

  // Bouwt één vraag als kaart(en) in `doel`.
  //   knoppen (knop, pop-up): opties naast elkaar (lofi 1b, 2a)
  //   lijst (exit, na aankoop): opties met rondjes en een knop Versturen (lofi 3, 4)
  // Vervolgvraag zonder "bij" staat er meteen onder (knop). Met "bij" verschijnt hij
  // pas na die keuze: bij knoppen als tweede blok (pop-up bij Nee), in een lijst
  // als tekstveld achter de optie (Anders, namelijk).
  // Geeft terug: het element dat de focus moet krijgen, en afronden() voor bij sluiten.
  function bouwVraag(sleutel, onderdeel, doel, sluitKnop, naVersturen) {
    const vraag = onderdeel.vraag;
    const vervolg = vraag.vervolg;
    const heeftOpties = Array.isArray(vraag.opties);
    const lijst = onderdeel.type === "exit" || onderdeel.type === "na_aankoop";
    const tekstMeteen = Boolean(vervolg && !vervolg.bij) || !heeftOpties;
    const id = `ds-titel-${onderdeel.type}`;

    const kaart = el("div", { class: "kaart" });
    const kop = el("div", { class: "kop" });
    kop.append(el("h2", { id }, vraag.tekst));
    if (sluitKnop) kop.append(sluitKnop);
    // Honeypot: onzichtbaar veld dat alleen bots invullen
    const honeypot = el("input", {
      class: "hp", name: "website", tabindex: "-1", autocomplete: "off", "aria-hidden": "true",
    });
    kaart.append(kop, honeypot);
    doel.append(kaart);

    let gekozen = null;
    let veld = null;
    let tweedeKaart = null;
    let andersVeld = null;
    let verstuurd = false;

    // Bij sluiten of weggaan: gekozen maar niet verstuurd, dan alleen de keuze versturen
    function afronden() {
      openstaand.delete(afronden);
      if (verstuurd || !gekozen) return;
      verstuurd = true;
      stuurAntwoord(sleutel, onderdeel, gekozen, null, honeypot.value);
    }
    afronden.doel = doel;

    function kies(optie) {
      gekozen = optie;
      if (!verstuurd) openstaand.add(afronden);
    }

    function verstuur(tekst) {
      if (verstuurd) return; // dubbelklik: maar één antwoord
      verstuurd = true;
      openstaand.delete(afronden);
      stuurAntwoord(sleutel, onderdeel, gekozen, tekst, honeypot.value);
      const bedankt = el("div", { class: "kaart" });
      const bedanktKop = el("div", { class: "kop" });
      bedanktKop.append(el("p", { class: "bedankt", role: "status" }, "Bedankt voor je feedback!"));
      if (sluitKnop) bedanktKop.append(sluitKnop);
      bedankt.append(bedanktKop);
      doel.replaceChildren(bedankt);
      if (sluitKnop) sluitKnop.focus();
      naVersturen();
    }

    function versturenKnop(lees) {
      const knop = el("button", { class: "primair", type: "button" }, "Versturen");
      knop.addEventListener("click", veilig(() => {
        const tekst = lees();
        if (!gekozen && !tekst.trim()) return (veld || kaart.querySelector("input[type=radio]")).focus();
        verstuur(tekst);
      }));
      const acties = el("div", { class: "acties" });
      acties.append(knop);
      return acties;
    }

    // Tekstveld met Versturen-knop; als titel = de vervolgvraag als kop van een tweede blok
    function tekstblok(blok, tekst, alsTitel) {
      const veldId = `ds-tekst-${onderdeel.type}${alsTitel ? "-2" : ""}`;
      const label = el("label", { for: veldId, class: alsTitel ? "titel" : "" }, tekst);
      veld = el("textarea", { id: veldId, maxlength: "500", rows: "3", placeholder: "typ hier..." });
      blok.append(label, veld, versturenKnop(() => veld.value));
    }

    if (heeftOpties && lijst) {
      const groep = el("div", { class: `lijst ${onderdeel.type}`, role: "radiogroup", "aria-labelledby": id });
      for (const optie of vraag.opties) {
        const regel = el("label", { class: "keuze" });
        const rondje = el("input", { type: "radio", name: `ds-${onderdeel.type}`, value: optie });
        regel.append(rondje, el("span", {}, optie));
        if (vervolg && vervolg.bij === optie) {
          andersVeld = el("input", {
            type: "text", class: "anders", maxlength: "500", "aria-label": vervolg.tekst, placeholder: "...",
          });
          andersVeld.addEventListener("focus", veilig(() => { rondje.checked = true; kies(optie); }));
          regel.append(andersVeld);
        }
        rondje.addEventListener("change", veilig(() => {
          kies(optie);
          if (andersVeld && vervolg.bij === optie) andersVeld.focus();
        }));
        groep.append(regel);
      }
      kaart.append(groep, versturenKnop(() =>
        andersVeld && gekozen === vervolg.bij ? andersVeld.value : ""));
    } else if (heeftOpties) {
      // Smileys: vijf grijze gezichtjes zonder tekst; bij muis of keuze in kleur, van rood (links) naar groen.
      // De optie blijft het antwoord en is de naam voor schermlezers (niet alleen kleur).
      const smileys = vraag.weergave === "smileys" && vraag.opties.length === SMILEYS.length;
      const rij = el("div", smileys
        ? { class: "opties smileys", role: "group", "aria-labelledby": id } : { class: "opties" });
      const knoppen = vraag.opties.map((optie, i) => {
        const b = smileys
          ? el("button", { class: `optie smiley s${i}`, type: "button", "aria-pressed": "false", "aria-label": optie, title: optie })
          : el("button", { class: "optie", type: "button", "aria-pressed": "false" }, optie);
        if (smileys) b.append(smiley(SMILEYS[i]));
        b.addEventListener("click", veilig(() => {
          kies(optie);
          for (const k of knoppen) k.setAttribute("aria-pressed", String(k === b));
          if (tekstMeteen) return; // versturen gaat via de knop Versturen
          if (vervolg && vervolg.bij === optie) {
            if (!tweedeKaart) {
              tweedeKaart = el("div", { class: "kaart" });
              tekstblok(tweedeKaart, vervolg.tekst, true);
              doel.append(tweedeKaart);
            }
            veld.focus();
          } else {
            verstuur("");
          }
        }));
        return b;
      });
      rij.append(...knoppen);
      kaart.append(rij);
    }
    if (tekstMeteen) {
      const tekst = vervolg ? vervolg.tekst + (vervolg.optioneel ? " (optioneel)" : "") : "Je antwoord";
      tekstblok(kaart, tekst, false);
    }

    return { eerste: kaart.querySelector(".optie, input[type=radio], textarea"), afronden };
  }

  // De zwevende vragen (knop, pop-up, exit, na aankoop zonder plek): één host onderaan de body
  function maakUi(sleutel) {
    const root = maakShadow(document.body);
    let paneel = null;
    let terugFocus = null;
    let paneelAfronden = null;

    function sluit() {
      if (!paneel) return;
      if (paneelAfronden) paneelAfronden(); // gekozen maar niet verstuurd: keuze alsnog bewaren
      paneelAfronden = null;
      paneel.remove();
      paneel = null;
      if (terugFocus && terugFocus.focus) terugFocus.focus();
    }

    // plek: tab-element (zijkant, naast het tabje), "midden" (exit), "balk" (onderin)
    // of niets (pop-up, rechtsonder). Op mobiel is het altijd een balk onderin.
    // focus: false bij vragen die vanzelf verschijnen (pop-up, balk): die mogen de
    // bezoeker niet storen in wat hij aan het doen is.
    function open(onderdeel, plek, focus = true) {
      sluit();
      // Geopend via het tabje: na sluiten terug naar het tabje (een klik geeft het
      // tabje in sommige browsers, zoals Safari, zelf geen focus). Anders terug naar
      // waar de bezoeker was; staat de focus in ons eigen blok, dan geeft de pagina
      // alleen de host terug, dus eerst daarbinnen kijken.
      terugFocus = plek instanceof Element ? plek : root.activeElement || document.activeElement;

      const dit = el("div", {
        class: "paneel", role: "dialog", "aria-labelledby": `ds-titel-${onderdeel.type}`,
      });
      dit.dataset.van = onderdeel.type;
      if (plek instanceof Element) {
        const kant = plek.classList.contains("links") ? "links" : "rechts";
        dit.classList.add("zij", kant);
        dit.style[kant === "links" ? "left" : "right"] = `${plek.offsetWidth}px`;
      } else if (plek === "midden") {
        dit.classList.add("midden");
        dit.setAttribute("aria-modal", "true");
        // Klik naast het venster sluit het
        dit.addEventListener("click", veilig((e) => e.target === dit && sluit()));
        // Tab blijft binnen het venster, zoals bij een echt dialoogvenster
        dit.addEventListener("keydown", veilig((e) => {
          if (e.key !== "Tab") return;
          const velden = [...dit.querySelectorAll("button, input, textarea")]
            .filter((v) => v.tabIndex !== -1 && v.offsetParent !== null);
          const eerste = velden[0];
          const laatste = velden[velden.length - 1];
          const nu = root.activeElement;
          if (e.shiftKey && nu === eerste) { e.preventDefault(); laatste.focus(); }
          else if (!e.shiftKey && nu === laatste) { e.preventDefault(); eerste.focus(); }
        }));
      } else if (plek === "balk") {
        dit.classList.add("balk");
      }

      const sluitKnop = el("button", { class: "sluit", type: "button", "aria-label": "Sluiten" }, "×");
      sluitKnop.addEventListener("click", veilig(sluit));
      const { eerste, afronden } = bouwVraag(sleutel, onderdeel, dit, sluitKnop, () =>
        setTimeout(veilig(() => paneel === dit && sluit()), 2500));
      paneelAfronden = afronden;

      paneel = dit;
      root.appendChild(dit);
      if (focus && eerste) eerste.focus();
    }

    root.addEventListener("keydown", veilig((e) => {
      if (e.key === "Escape") sluit();
    }));

    // Het tabje staat op alle pagina's, tenzij de instellingen het beperken:
    //   paginas:    alleen op deze pagina's (leeg = alle pagina's)
    //   uitsluiten: niet op deze pagina's (gaat voor op paginas)
    // Geeft een functie terug die dit opnieuw bekijkt bij een paginawissel.
    function knop(onderdeel) {
      const inst = onderdeel.instellingen || {};
      const kant = inst.positie === "links" ? "links" : "rechts";
      const k = el("button", { class: `tab ${kant}`, type: "button", "aria-haspopup": "dialog" }, "Feedback");
      // Tweede klik sluit de eigen vraag; staat een andere vraag open, dan vervangt de knop die
      k.addEventListener("click", veilig(() => (paneel && paneel.dataset.van === "knop" ? sluit() : open(onderdeel, k))));
      root.appendChild(k);

      function bijwerken() {
        const pad = location.pathname;
        const toegestaan = !Array.isArray(inst.paginas) || inst.paginas.length === 0 || padPast(inst.paginas, pad);
        const uitgesloten = Array.isArray(inst.uitsluiten) && padPast(inst.uitsluiten, pad);
        k.hidden = !toegestaan || uitgesloten;
        if (k.hidden && paneel && paneel.dataset.van === "knop") sluit();
      }
      bijwerken();
      return bijwerken;
    }

    return { knop, open, isOpen: () => paneel !== null };
  }

  // Is de bezoeker iets aan het typen op de pagina? (zoekveld, formulier)
  const TYPVELD = /^(text|search|email|tel|url|number|password)$/i;
  function bezigMetTypen() {
    const a = document.activeElement;
    if (!a) return false;
    return a.isContentEditable || a.nodeName === "TEXTAREA" || (a.nodeName === "INPUT" && TYPVELD.test(a.type));
  }

  // Pop-up: na X seconden op een pagina die past, als er deze sessie nog
  // geen vraag getoond is. De knop telt daarbij niet mee.
  // Op het moment van tonen kijken we opnieuw: is de bezoeker nog op een pagina
  // die past, is het tabblad zichtbaar, typt hij niet en staat er geen andere
  // vraag open? Anders over 2 seconden opnieuw proberen.
  // Geeft een functie terug die de klok opnieuw start bij een paginawissel.
  const OPNIEUW_PROBEREN = 2000;

  function planPopup(onderdeel, ui) {
    const inst = onderdeel.instellingen || {};
    const seconden = Number(inst.vertraging_sec) || 30;
    const pastHier = () => !Array.isArray(inst.paginas) || padPast(inst.paginas, location.pathname);
    let klok = null;

    function probeer() {
      klok = null;
      if (vraagAlGetoond() || !pastHier()) return;
      if (document.visibilityState === "hidden" || bezigMetTypen() || ui.isOpen()) {
        klok = setTimeout(veilig(probeer), OPNIEUW_PROBEREN);
        return;
      }
      markeerGetoond();
      ui.open(onderdeel, null, false);
    }

    function startKlok() {
      clearTimeout(klok);
      klok = null;
      if (vraagAlGetoond() || !pastHier()) return;
      klok = setTimeout(veilig(probeer), seconden * 1000);
    }

    startKlok();
    return startKlok;
  }

  // Exit-intent: alleen desktop, alleen met een muis.
  // Meting: één mouseout-luisteraar op de pagina. De browser stuurt mouseout bij
  // elke grens tussen elementen; verlaat de muis de pagina zelf, dan is er geen
  // volgend element (relatedTarget is leeg). Dat tellen we als vertrek als:
  //  - de muis de pagina aan de bovenkant verlaat (richting tabbladen, adresbalk,
  //    terugknop of sluitknop): de bovenrand is de dichtstbijzijnde rand en de
  //    laatste meting ligt binnen EXIT_BOVENRAND px (bij snel bewegen meet de
  //    browser de laatste positie vaak nog net in beeld);
  //  - er geen muisknop is ingedrukt (tekst selecteren of slepen);
  //  - de muis niet uit een formulierveld komt (open keuzelijst of lijst van
  //    automatisch aanvullen geeft in browsers ook een lege relatedTarget);
  //  - de bezoeker niet binnen EXIT_WACHT ms terug is (per ongeluk langs de rand);
  //  - de bezoeker minimaal X sec op de pagina is (gemeten vanaf het laden) en de
  //    huidige pagina past. Pagina en apparaat worden pas op dat moment bekeken,
  //    zodat het ook werkt op sites die zonder herladen van pagina wisselen.
  const EXIT_BOVENRAND = 20;
  const EXIT_WACHT = 200;
  const FORMULIERVELD = /^(INPUT|SELECT|OPTION|TEXTAREA)$/;

  function planExit(onderdeel, ui) {
    const inst = onderdeel.instellingen || {};
    if (vraagAlGetoond()) return;
    const minimaal = (Number(inst.min_sec_op_pagina) || 0) * 1000;
    let wachten = null;

    function terug() {
      clearTimeout(wachten);
      wachten = null;
    }

    function toon() {
      wachten = null;
      document.removeEventListener("mouseover", terug);
      if (apparaat() !== "desktop" || vraagAlGetoond() || ui.isOpen()) return;
      if (Array.isArray(inst.paginas) && !padPast(inst.paginas, location.pathname)) return;
      document.removeEventListener("mouseout", bijVerlaten);
      markeerGetoond();
      ui.open(onderdeel, "midden");
    }

    // Draait bij elke muisbeweging tussen elementen: de eerste controle laat
    // vrijwel alle gewone bewegingen meteen door, zonder verder rekenwerk.
    function bijVerlaten(e) {
      if (e.relatedTarget || wachten) return;
      try {
        const y = e.clientY;
        const x = e.clientX;
        if (y > EXIT_BOVENRAND || y > x || y > innerWidth - x) return; // niet via de bovenkant
        if (e.buttons) return;
        if (e.target && FORMULIERVELD.test(e.target.nodeName)) return;
        if (performance.now() < minimaal) return;
        wachten = setTimeout(veilig(toon), EXIT_WACHT);
        document.addEventListener("mouseover", terug, { once: true });
      } catch {
        // stil stoppen: de site gaat altijd voor
      }
    }

    document.addEventListener("mouseout", bijVerlaten);
  }

  // Na aankoop: op de bedankpagina, in de pagina zelf op de plek
  // <div id="ds-feedback"></div>. Veel bedankpagina's bouwen zich met JavaScript
  // op; we wachten daarom tot PLEK_WACHT ms op die plek. Komt hij niet, dan als
  // balk onderin.
  // Geeft een functie terug die opnieuw kijkt bij een paginawissel.
  const PLEK_WACHT = 3000;

  function planNaAankoop(sleutel, onderdeel, ui) {
    const inst = onderdeel.instellingen || {};

    function kijk() {
      if (!inst.bedankpagina || !padPast([inst.bedankpagina], location.pathname)) return;
      if (vraagAlGetoond()) return;
      markeerGetoond(); // meteen, zodat de pop-up op deze pagina niet ook komt
      const begin = Date.now();

      (function zoekPlek() {
        const plek = document.getElementById("ds-feedback");
        if (plek) {
          const root = maakShadow(plek);
          const blok = el("div", { class: "inpagina", role: "region", "aria-labelledby": `ds-titel-${onderdeel.type}` });
          root.appendChild(blok);
          bouwVraag(sleutel, onderdeel, blok, null, () => {});
        } else if (Date.now() - begin < PLEK_WACHT) {
          setTimeout(veilig(zoekPlek), 250);
        } else {
          ui.open(onderdeel, "balk", false);
        }
      })();
    }

    kijk();
    return kijk;
  }

  // Sites die zonder herladen van pagina wisselen (single-page): elke seconde
  // kijken of het adres veranderd is. Dat is één vergelijking per seconde.
  function bijPaginawissel(doe) {
    let pad = location.pathname;
    setInterval(veilig(() => {
      if (location.pathname === pad) return;
      pad = location.pathname;
      doe();
    }), 1000);
  }

  async function start() {
    if (!sleutel) return;

    const res = await fetch(`${API}/config?k=${encodeURIComponent(sleutel)}`);
    if (!res.ok) return;
    const { onderdelen } = await res.json();
    if (!Array.isArray(onderdelen) || onderdelen.length === 0) return;

    const ui = maakUi(sleutel);
    const plannen = {
      knop: (o) => ui.knop(o), // geeft bijwerken() terug voor paginawissels
      popup: (o) => planPopup(o, ui),
      exit: (o) => planExit(o, ui),
      na_aankoop: (o) => planNaAankoop(sleutel, o, ui),
    };
    // Na aankoop eerst: op de bedankpagina gaat die vraag voor
    const volgorde = ["na_aankoop", "knop", "exit", "popup"];
    const opnieuw = [];
    for (const type of volgorde) {
      for (const onderdeel of onderdelen) {
        if (onderdeel.type !== type) continue;
        try {
          const herstart = plannen[type](onderdeel);
          if (typeof herstart === "function") opnieuw.push(herstart);
        } catch {
          // dit onderdeel overslaan, de rest gaat door
        }
      }
    }
    bijPaginawissel(() => {
      // Haalt de site bij een paginawissel ons blok weg (bijv. de vraag na aankoop),
      // dan geldt dat als weggaan: gekozen maar niet verstuurd, dan keuze bewaren
      openstaand.forEach((afronden) => !afronden.doel.isConnected && veilig(afronden)());
      opnieuw.forEach((f) => veilig(f)());
    });
  }

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    .tab {
      position: fixed; top: 50%; z-index: 2147483000;
      writing-mode: vertical-rl; transform: translateY(-50%) rotate(180deg);
      background: #111; color: #fff; border: 0; padding: 14px 9px;
      font-size: 14px; font-weight: 600; letter-spacing: .02em; cursor: pointer;
    }
    .tab.rechts { right: 0; border-radius: 0 6px 6px 0; }
    .tab.links  { left: 0;  border-radius: 6px 0 0 6px; }
    .tab[hidden] { display: none !important; }
    .paneel {
      position: fixed; right: 16px; bottom: 16px; z-index: 2147483001;
      width: 340px; max-width: calc(100vw - 32px);
      display: flex; flex-direction: column; gap: 8px;
      color: #111; font-size: 15px; line-height: 1.4;
    }
    .kaart {
      display: flex; flex-direction: column; gap: 10px; padding: 16px;
      background: #fff; border-radius: 10px; box-shadow: 0 8px 30px rgba(0, 0, 0, .2);
    }
    .paneel.zij { top: 50%; bottom: auto; transform: translateY(-50%); max-width: calc(100vw - 56px); }
    .paneel.zij.rechts { animation: uit-rechts .2s ease-out; }
    .paneel.zij.links  { animation: uit-links .2s ease-out; }
    @keyframes uit-rechts { from { opacity: 0; transform: translate(24px, -50%); } }
    @keyframes uit-links  { from { opacity: 0; transform: translate(-24px, -50%); } }
    /* Exit: groot venster midden in beeld, pagina erachter grijs (lofi 3) */
    .paneel.midden {
      inset: 0; width: auto; max-width: none; align-items: center; justify-content: center;
      background: rgba(0, 0, 0, .35); animation: verschijn .15s ease-out;
    }
    .paneel.midden .kaart { width: 440px; max-width: calc(100vw - 32px); padding: 24px; }
    .paneel.midden h2 { font-size: 20px; }
    @keyframes verschijn { from { opacity: 0; } }
    /* Na aankoop zonder plek in de pagina: balk onderin */
    .paneel.balk { left: 0; right: 0; bottom: 0; width: auto; max-width: none; }
    .paneel.balk .kaart { border-radius: 0; }
    /* Na aankoop in de pagina zelf (lofi 4) */
    .inpagina { color: #111; font-size: 15px; line-height: 1.4; margin: 16px 0; }
    .inpagina .kaart { box-shadow: none; background: #fffbeb; border: 1px solid #e5d9a8; }
    .kop { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
    h2, .titel { margin: 0; font-size: 16px; font-weight: 600; }
    .sluit { background: none; border: 0; padding: 0 4px; font-size: 22px; line-height: 1; color: #555; cursor: pointer; }
    .opties { display: flex; flex-wrap: wrap; gap: 8px; }
    .optie {
      flex: 1 1 0; min-width: 80px; padding: 10px 8px; font-size: 15px; color: #111; cursor: pointer;
      background: #fff; border: 1px solid #bbb; border-radius: 6px;
    }
    .optie:hover { border-color: #111; }
    .optie[aria-pressed="true"] { background: #e8e8e8; border-color: #111; font-weight: 600; }
    .opties.smileys { flex-wrap: nowrap; justify-content: space-between; gap: 4px; max-width: 320px; }
    .optie.smiley {
      flex: 0 0 auto; min-width: 0; width: 52px; height: 52px; padding: 4px;
      background: none; border: 2px solid transparent; border-radius: 50%; transition: transform .1s;
    }
    .optie.smiley svg { display: block; width: 100%; height: 100%; }
    .optie.smiley { color: #9a9a9a; }
    .optie.smiley:hover { transform: scale(1.1); border-color: transparent; }
    .optie.smiley[aria-pressed="true"] { background: none; border-color: #111; }
    .s0:hover, .s0:focus-visible, .s0[aria-pressed="true"] { color: #e5484d; }
    .s1:hover, .s1:focus-visible, .s1[aria-pressed="true"] { color: #f5853f; }
    .s2:hover, .s2:focus-visible, .s2[aria-pressed="true"] { color: #e0b000; }
    .s3:hover, .s3:focus-visible, .s3[aria-pressed="true"] { color: #7cb82f; }
    .s4:hover, .s4:focus-visible, .s4[aria-pressed="true"] { color: #30a46c; }
    .lijst { display: grid; gap: 8px; }
    .lijst.na_aankoop { grid-template-columns: 1fr 1fr; }
    .keuze {
      display: flex; align-items: center; gap: 8px; padding: 10px 12px; cursor: pointer;
      background: #fff; border: 1px solid #bbb; border-radius: 6px;
    }
    .keuze:hover { border-color: #111; }
    .keuze:has(input:checked) { border-color: #111; background: #f0f0f0; }
    .keuze input[type=radio] { margin: 0; accent-color: #111; }
    .anders { flex: 1; min-width: 60px; font: inherit; border: 0; border-bottom: 1px dotted #888; background: transparent; padding: 0 2px; }
    label { font-size: 14px; }
    .keuze, .keuze span { font-size: 15px; }
    textarea { width: 100%; padding: 8px; font: inherit; border: 1px solid #bbb; border-radius: 6px; resize: vertical; }
    .acties { display: flex; justify-content: flex-end; }
    .primair { padding: 10px 18px; font-size: 15px; color: #fff; background: #111; border: 0; border-radius: 6px; cursor: pointer; }
    .bedankt { margin: 0; }
    /* Mobiel: smaller tabje, vraag als balk onderin waar de duim bij kan (lofi 5a, 5b, 5c) */
    @media (max-width: 767px) {
      .tab { padding: 10px 6px; font-size: 12px; }
      .paneel, .paneel.zij {
        left: 0 !important; right: 0 !important; top: auto; bottom: 0; width: auto; max-width: none;
        transform: none; gap: 0; padding-top: 8px; background: #fff; border-radius: 16px 16px 0 0;
        box-shadow: 0 -6px 24px rgba(0, 0, 0, .2);
      }
      .paneel, .paneel.zij.rechts, .paneel.zij.links { animation: omhoog .2s ease-out; }
      .paneel::before { content: ""; align-self: center; width: 40px; height: 4px; border-radius: 2px; background: #ccc; }
      .paneel .kaart { box-shadow: none; border-radius: 0; }
      .kaart + .kaart { border-top: 1px solid #eee; }
      .lijst.na_aankoop { grid-template-columns: 1fr; }
      @keyframes omhoog { from { transform: translateY(100%); } }
    }
    .hp { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }
    button:focus-visible, textarea:focus-visible, input:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
    @media (prefers-reduced-motion: reduce) { .paneel { animation: none !important; } }
    @media print { .tab, .paneel, .inpagina { display: none !important; } }
  `;

  const go = () => start().catch(() => {});
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go);
  else go();
})();
