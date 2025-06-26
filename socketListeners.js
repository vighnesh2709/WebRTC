

socket.on('availableOffers', offers => {
    console.log(offers)
    createOfferEls(offers)
})

socket.on('newOfferAwaiting', offers => {
    createOfferEls(offers)
})

socket.on('answerResponse', offerObj => {
    console.log(offerObj)
    addAnswer(offerObj)
})

socket.on('receivedIceCandidateFromServer', iceCandidate => {
    addNewIceCandidate(iceCandidate)
    console.log(iceCandidate)
})

function createOfferEls(offers) {
    const answerEl = document.querySelector('#answer');
    answerEl.innerHTML = '';

    offers.forEach(o => {
        console.log(o);

        const newOfferEl = document.createElement('div');
        newOfferEl.innerHTML = `<button class="btn btn-success col-1">Answer ${o.offererUserName}</button>`;

        const button = newOfferEl.querySelector('button');
        button.addEventListener('click', () => {
            answerOffer(o);
            sendRawAudio();
        });

        answerEl.appendChild(newOfferEl);
        return;
    });
}
