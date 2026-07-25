//modal to show game instructions
const modal = document.getElementById('infoModal');
const infoBtn = document.getElementById('infoButton');
const closeBtn = document.getElementById('closeModalBtn');

// Open modal when clicking the info icon
infoBtn.onclick = () => { modal.style.display = 'flex'; };
// Close modal when clicking close button
closeBtn.onclick = () => { modal.style.display = 'none'; };
// Close modal if player clicks outside of it
window.onclick = (event) => {
    if (event.target == modal) {
        modal.style.display = 'none';
    }
};

// single player country match button
document.getElementById('singlePlayerBtn')?.addEventListener('click', () => {
    window.location.href = 'gameLayout.html?mode=countrymatch';
});
    // signle player precision button
document.getElementById('singlePlayerBtnPrecision')?.addEventListener('click', () => {
    window.location.href = 'gameLayout.html?mode=precision';
});


// host room button 
document.getElementById('create-room-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('create-room-btn');
    btn.innerText = "Creating...";
    
    //the try catch is to see if we can connect to a room
    try {
        const response = await fetch('createRoom?mode=countrymatch');
        const data = await response.json();

        //if successfull
        if (data.success) {
            document.getElementById('room-display').style.display = 'block';
            document.getElementById('room-code-text').innerText = data.room_code;
            btn.style.display = 'none'; 
            
            // Check the server every 2 seconds
            // If Player 2 has joined. stop checking and load the game
            // This is necessary because Player 2 needs to update the room file, and Player 1 needs to know when that happens
            //the checks are done every 2 seconds 
            const pollInterval = setInterval(async () => {
                try {
                    const statusRes = await fetch(`checkStatus?code=${data.room_code}`);
                    const roomData = await statusRes.json();
                    
                    // If Player 2 changed the file, stop checking and load the game
                    if (roomData.player2_joined === true) {
                        clearInterval(pollInterval);
                        window.location.href = `gameLayout.html?room=${data.room_code}&player=1&mode=countrymatch`;
                    }
                } catch (e) {
                    console.error("Checking status failed...");
                }
            }, 2000); 

            
        } else {
            alert("Error: " + data.error);
            btn.innerText = "Host Multiplayer Game";
        }
    } catch (err) { alert("Failed to connect to server."); }
});

// join room button
document.getElementById('join-room-btn')?.addEventListener('click', async () => {
    const code = document.getElementById('room-code-input').value.toUpperCase();
    if(code.length !== 4) return alert("Enter a 4-letter code");
    //the try catch is to see if we can connect to a room
    try {
        const response = await fetch(`joinRoom?code=${code}`);
        const data = await response.json();

        if (data.success) {
            // successful and redirect with mode=countrymatch
            const mode = data.mode || 'countrymatch';
            window.location.href = `gameLayout.html?room=${data.room_code}&player=2&mode=${mode}`;
        } else {
            alert(data.error);
        }
    } catch (err) { alert("Connection failed."); }
});



    // same as above but for precision mode
document.getElementById('create-room-btnPrecision')?.addEventListener('click', async () => {
    const btn = document.getElementById('create-room-btnPrecision');
    btn.innerText = "Creating...";
    
    try {
        const response = await fetch('createRoom?mode=precision');
        const data = await response.json();

        if (data.success) {
            document.getElementById('room-displayPrecision').style.display = 'block';
            document.getElementById('room-code-textPrecision').innerText = data.room_code;
            btn.style.display = 'none'; 
            
           
            const pollInterval = setInterval(async () => {
                try {
                    const statusRes = await fetch(`checkStatus?code=${data.room_code}`);
                    const roomData = await statusRes.json();
                    
                    if (roomData.player2_joined === true) {
                        clearInterval(pollInterval);
                        // Redirect with mode=precision
                        window.location.href = `gameLayout.html?room=${data.room_code}&player=1&mode=precision`;
                    }
                } catch (e) { console.error("Polling failed..."); }
            }, 2000);

        } else {
            alert("Error: " + data.error);
            btn.innerText = "HOST GAME";
        }
    } catch (err) { alert("Failed to connect to server."); }
});