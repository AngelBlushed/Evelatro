/* ===========================================================
   Cartes à jouer : un paquet, le mélange, et l'affichage.
   Partagé par le Blackjack et le Vidéo Poker.
   =========================================================== */

const Cards = (() => {
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const SUITS = ['♠', '♥', '♦', '♣']; // pique, coeur, carreau, trefle
  const RED = new Set(['♥', '♦']);              // coeur et carreau sont rouges

  /** Un paquet neuf de 52 cartes, dans l'ordre. */
  function freshDeck() {
    const deck = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({ rank, suit });
      }
    }
    return deck;
  }

  /** Mélange (Fisher-Yates) et renvoie une nouvelle liste. */
  function shuffle(deck) {
    const copy = deck.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  /** Construit la petite carte affichée à l'écran. */
  function cardEl(card, faceDown) {
    if (faceDown) return el('div', { class: 'card card-back' });
    return el('div', { class: 'card' + (RED.has(card.suit) ? ' card-red' : '') },
      el('span', { class: 'card-rank', text: card.rank }),
      el('span', { class: 'card-suit', text: card.suit }),
    );
  }

  return { RANKS, SUITS, RED, freshDeck, shuffle, cardEl };
})();

window.Cards = Cards;
