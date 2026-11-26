# Feedbacktool Doublesmart: script

Dit is het script dat korte feedbackvragen toont aan bezoekers van een website. Het staat online via GitHub Pages:

```
https://doublesmartstackbv.github.io/feedback-script/feedback.js
```

## Plaatsing

Eén regel op de website, met de publieke sleutel van de klant:

```html
<script src="https://doublesmartstackbv.github.io/feedback-script/feedback.js?k=[publieke_sleutel]" async></script>
```

Deze regel werkt in de `<head>`, in de `<body>` en via Google Tag Manager (Custom HTML-tag). De oudere vorm met `data-klant="[publieke_sleutel]"` werkt ook nog, maar niet via Tag Manager: Tag Manager haalt dat attribuut weg.

De publieke sleutel is geen geheim. Het script toont alleen iets op domeinen die voor die klant zijn toegestaan.

## Privacy

Het script slaat geen cookies op en geen IP-adres, browsergegevens of bezoekersnummer. Het onthoudt alleen in `sessionStorage` dat er deze sessie al een vraag is getoond; dat verdwijnt zodra het tabblad sluit.

## Beheer

Dit bestand wordt niet hier bewerkt. Het wordt bijgehouden in de (privé) projectrepo van Doublesmart en daarvandaan hierheen gekopieerd. Een wijziging staat binnen ongeveer tien minuten live op elke site die het script laadt.
