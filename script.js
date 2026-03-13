const API_URL = "https://script.google.com/macros/s/AKfycby42LxFQdKiS8bZ8E4oItbGvTpthX6Pwku9ynnOuMlRfMr0syVfmaEQ9c-tUI8q4HfrWQ/exec"; 
const QR_FOLDER_ID = "1jx5XVDpGo5MAkykNbJ08eJgW5zTVVXmV"; 

const mockMenuData = [];
let menuData = [];
let masterData = [];
let cart = [];
let currentOrders = [];
let currentPayOrder = null;
let historyBills = [];
let lastOrderCount = -1; 

const categories = ['เครื่องดื่ม', 'ขนม/ของว่าง', 'ของใช้ในบ้าน', 'อาหารแห้ง/เครื่องปรุง', 'อาหารสด', 'เบ็ดเตล็ด'];

let isCustomerMode = false;
let customerTable = "";
let isQuickPayMode = false; 
let notifiedOrders = new Set();
let isStoreOpen = true; 
let myLastOrders = [];  

function speak(text) { 
    if ('speechSynthesis' in window) { 
        // ลบ window.speechSynthesis.cancel(); ออกไปแล้ว เพื่อให้เสียงต่อคิวกัน
        const utterance = new SpeechSynthesisUtterance(text); 
        utterance.lang = 'th-TH'; 
        utterance.rate = 1.0; 
        window.speechSynthesis.speak(utterance); 
    } 
}

function playNotificationSound() { const beep = new Audio("https://actions.google.com/sounds/v1/alarms/beep_short.ogg"); beep.play().catch(e=>console.log("Audio blocked", e)); }

function holdBill() {
    if(cart.length === 0) { showToast('ไม่มีรายการให้พักบิล', 'warning'); return; }
    let heldBills = JSON.parse(localStorage.getItem('heldBills') || "[]");
    const newBill = { id: Date.now(), timestamp: new Date().toISOString(), items: cart, total: cart.reduce((sum, i) => sum + (i.price * i.qty), 0) };
    heldBills.push(newBill);
    localStorage.setItem('heldBills', JSON.stringify(heldBills));
    cart = []; renderCart();
    showToast('พักบิลเรียบร้อย (' + heldBills.length + ' รายการ)', 'success');
    
}

function openRecallModal() {
    const heldBills = JSON.parse(localStorage.getItem('heldBills') || "[]");
    if (heldBills.length === 0) { showToast('ไม่มีบิลที่พักไว้', 'warning'); return; }
    const listContainer = document.getElementById('heldBillsList');
    listContainer.innerHTML = heldBills.map((bill, index) => {
        const timeStr = new Date(bill.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        return `<div class="bg-white border border-gray-200 rounded-xl p-3 shadow-sm hover:shadow-md transition flex justify-between items-center animate-fade-in"><div class="flex-1 cursor-pointer" onclick="recallBill(${index})"><div class="flex items-center gap-2"><span class="bg-orange-100 text-orange-800 text-xs font-bold px-2 py-0.5 rounded">${timeStr}</span><span class="font-bold text-gray-700">${bill.items.length} รายการ</span></div><div class="text-sm text-gray-500 mt-1">ยอดรวม <span class="text-orange-600 font-bold">${bill.total.toLocaleString()} ฿</span></div></div><button onclick="deleteHeldBill(${index})" class="w-8 h-8 rounded-full bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center ml-2"><i class="fas fa-trash-alt text-xs"></i></button></div>`;
    }).join('');
    document.getElementById('recallModal').classList.remove('hidden');
}

function recallBill(index) {
    let heldBills = JSON.parse(localStorage.getItem('heldBills') || "[]");
    if (cart.length > 0) { if(!confirm("มีรายการค้างอยู่ในตะกร้า ต้องการเคลียร์และเรียกบิลเก่าไหม?")) return; }
    cart = heldBills[index].items;
    heldBills.splice(index, 1); localStorage.setItem('heldBills', JSON.stringify(heldBills));
    closeModal('recallModal'); renderCart(); showToast('เรียกบิลกลับมาแล้ว', 'success'); 
    
}

function deleteHeldBill(index) {
    if(!confirm("ต้องการลบบิลนี้ใช่ไหม?")) return;
    let heldBills = JSON.parse(localStorage.getItem('heldBills') || "[]");
    heldBills.splice(index, 1); localStorage.setItem('heldBills', JSON.stringify(heldBills));
    if (heldBills.length === 0) { closeModal('recallModal'); showToast('ลบบิลหมดแล้ว', 'success'); } else { openRecallModal(); }
}

function renderCategoryBar() {
    const bar = document.getElementById('categoryBar');
    bar.innerHTML = `<button onclick="filterMenu('All')" class="cat-btn bg-gradient-to-r from-orange-500 to-yellow-500 text-white px-5 py-2 rounded-full shadow-md text-sm font-bold transition transform hover:scale-105 border border-orange-600 shrink-0">ทั้งหมด</button>` + categories.map(c => `<button onclick="filterMenu('${c}')" class="cat-btn bg-white text-gray-600 hover:bg-orange-50 hover:text-orange-600 px-5 py-2 rounded-full shadow-sm text-sm font-medium transition border border-gray-200 shrink-0">${c}</button>`).join('');
}

function populateCategorySelects() {
    const opts = categories.map(c => `<option>${c}</option>`).join('');
    const mCat = document.getElementById('mCategory'); const eCat = document.getElementById('eCategory');
    if(mCat) mCat.innerHTML = opts; if(eCat) eCat.innerHTML = opts;
}

function initDateTime() {
    const updateTime = () => { const now = new Date(); document.getElementById('dateTimeDisplay').innerText = `${now.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })} ${now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`; };
    updateTime(); setInterval(updateTime, 1000);
}

function getDriveUrl(input) {
    if (!input) return '';
    let id = input;
    if (input.includes('drive.google.com/thumbnail')) return input;
    if (input.includes('http') || input.includes('google.com')) { const match = input.match(/[-\w]{25,}/); if (match) id = match[0]; }
    return `https://drive.google.com/thumbnail?id=${id}&sz=w800`;
}

function initBankQR() {
    const promptPayID = localStorage.getItem('promptPayID');
    const amount = currentPayOrder ? currentPayOrder.totalPrice : 0;
    const imgEl = document.getElementById('bankQRImage');
    const labelEl = document.getElementById('ppLabel'); 
    if (!imgEl) return; 

    // 1. ถ้ามีการตั้งค่า PromptPay ไว้ ให้สร้าง QR ทันที
    if (promptPayID) {
        const payload = generatePayload(promptPayID, amount);
        imgEl.src = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${payload}`;
        if (labelEl) labelEl.innerText = `พร้อมเพย์: ${promptPayID}`; 
        return; // จบการทำงาน
    } 

    // 2. 🟢 เช็คว่ามี ID รูปภาพอยู่ในเครื่องหรือยัง (ไม่ต้องโหลดใหม่)
    const savedQR = localStorage.getItem('bankQRID');
    if (savedQR) {
        const url = getDriveUrl(savedQR);
        imgEl.src = url; // เอา &t= เวลาต่อท้ายออก บราวเซอร์จะได้ใช้รูปจากแคช โหลดไวทันที
        if (labelEl) labelEl.innerText = "สแกนจ่ายเงิน (ภาพที่อัปโหลด)";
        return; // จบการทำงาน (ไม่ไปเรียก API ให้เสียเวลา)
    }
    
    // 3. 🔴 ถ้าไม่มีทั้งคู่ในเครื่อง (เช่น เปิดใช้เว็บครั้งแรก) ถึงจะไปดึงจาก Server
    imgEl.src = "https://placehold.co/400x400?text=Loading+QR...";
    if (labelEl) labelEl.innerText = "กำลังโหลด QR Code...";

    fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: "getBankQR" }) })
    .then(res => res.json())
    .then(data => {
        if (data.result === 'success' && data.found) {
            // เจอ ID รูปภาพในชีต
            const url = getDriveUrl(data.fileId);
            imgEl.src = url; 
            if (labelEl) labelEl.innerText = "สแกนจ่ายเงิน (ภาพที่อัปโหลด)";
            
            // บันทึก ID ลงเครื่องไว้ใช้ครั้งต่อไป จะได้ไม่ต้องโหลดอีก
            localStorage.setItem('bankQRID', data.fileId); 
        } else {
            // ไม่มีข้อมูลในชีตเลย
            imgEl.src = "https://placehold.co/400x400?text=Set+PromptPay";
            if (labelEl) labelEl.innerText = "ยังไม่ได้ตั้งค่าพร้อมเพย์";
            localStorage.removeItem('bankQRID');
        }
    })
    .catch(err => {
        console.error("Error fetching Bank QR:", err);
        imgEl.src = "https://placehold.co/400x400?text=Error+Loading";
    });
}

function handleQRClick() {
    const hasPP = localStorage.getItem('promptPayID');
    const hasBankQR = localStorage.getItem('bankQRID');
    if (hasPP) { openPromptPayModal(); } else if (hasBankQR) { openManageQRModal(true); } else { openManageQRModal(false); }
}

function openPromptPayModal() {
    const current = localStorage.getItem('promptPayID') || '';
    document.getElementById('ppInput').value = current;
    document.getElementById('promptPayModal').classList.remove('hidden');
    setTimeout(() => document.getElementById('ppInput').focus(), 300);
}

function savePromptPayID() {
    const newID = document.getElementById('ppInput').value;
    if (newID) {
        const cleanID = newID.trim().replace(/[^0-9]/g, '');
        if (cleanID.length === 10 || cleanID.length === 13) {
            localStorage.setItem('promptPayID', cleanID); 
            showToast('บันทึก PromptPay แล้ว', 'success'); 
            initBankQR(); 
            closeModal('promptPayModal');
        } else { alert("เบอร์โทรต้องมี 10 หลัก หรือ เลขบัตร 13 หลัก"); }
    } else { clearPromptPayID(); }
}

function clearPromptPayID() {
    localStorage.removeItem('promptPayID'); document.getElementById('ppInput').value = '';
    showToast('ลบ PromptPay แล้ว', 'success'); initBankQR(); closeModal('promptPayModal');
}

function checkAndUseOriginalQR() {
    const savedQR = localStorage.getItem('bankQRID');
    if (savedQR) {
        localStorage.removeItem('promptPayID');
        initBankQR();
        showToast('กลับมาใช้รูป QR Code เดิมเรียบร้อย', 'success');
        const imgEl = document.getElementById('bankQRImage');
        if(imgEl) {
            imgEl.classList.add('opacity-50');
            setTimeout(() => imgEl.classList.remove('opacity-50'), 300);
        }
    } else {
        showToast('ไม่พบรูป QR Code เดิมในระบบ (กรุณาอัปโหลดก่อน)', 'warning');
        speak("ไม่พบรูปเดิมค่ะ");
    }
}

function openManageQRModal(hasFile) {
    const modal = document.getElementById('manageQRModal');
    const statusText = document.getElementById('mqrStatusText');
    const statusIcon = document.getElementById('mqrStatusIcon');
    const btnDelete = document.getElementById('btnDeleteQR');
    if (hasFile) {
        statusText.innerText = "พบรูปภาพในระบบ"; statusText.classList.replace('text-gray-500', 'text-green-600');
        statusIcon.innerHTML = '<i class="fas fa-check-circle text-green-500"></i>'; btnDelete.classList.remove('hidden');
    } else {
        statusText.innerText = "ไม่พบรูปภาพในโฟลเดอร์"; statusText.classList.replace('text-green-600', 'text-gray-500');
        statusIcon.innerHTML = '<i class="fas fa-image"></i>'; btnDelete.classList.add('hidden');
    }
    modal.classList.remove('hidden');
}

function deleteServerQR() {
    if(!confirm("ต้องการลบรูปภาพจากเซิร์ฟเวอร์ใช่หรือไม่?")) return;
    setLoading('btnDeleteQR', true, 'กำลังลบ...');
    const currentFileId = localStorage.getItem('bankQRID');
    fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: "deleteQR", folderId: QR_FOLDER_ID, fileId: currentFileId }) })
    .then(res => res.json()).then(data => {
        if(data.result === 'success') {
            localStorage.removeItem('bankQRID'); initBankQR(); openManageQRModal(false); showToast('ลบรูปภาพเรียบร้อย', 'success');
        } else { alert('ลบไม่สำเร็จ: ' + data.error); }
    }).catch(err => { alert('Error: ' + err); }).finally(() => { setLoading('btnDeleteQR', false, 'ลบรูปภาพเดิม'); });
}

function crc16(data) {
    let crc = 0xFFFF;
    for (let i = 0; i < data.length; i++) {
        let x = ((crc >> 8) ^ data.charCodeAt(i)) & 0xFF; x ^= x >> 4; crc = ((crc << 8) ^ (x << 12) ^ (x << 5) ^ x) & 0xFFFF;
    }
    return ('0000' + crc.toString(16).toUpperCase()).slice(-4);
}

function generatePayload(mobileNumber, amount) {
    const target = mobileNumber.replace(/[^0-9]/g, '');
    let targetFormatted = target;
    if (target.length === 10 && target.startsWith('0')) { targetFormatted = '66' + target.substring(1); }
    const merchantIdTag = (targetFormatted.length >= 13) ? '02' : '01'; 
    const merchantInfoValue = '0016A000000677010111' + merchantIdTag + ('00'+targetFormatted.length).slice(-2) + targetFormatted;
    const merchantInfo = '29' + ('00'+merchantInfoValue.length).slice(-2) + merchantInfoValue;
    const country = '5802TH'; const currency = '5303764'; 
    let amountTag = '';
    if (amount > 0) { const amtStr = parseFloat(amount).toFixed(2); amountTag = '54' + ('00'+amtStr.length).slice(-2) + amtStr; }
    const version = '000201'; const type = amount > 0 ? '010212' : '010211'; 
    const rawData = version + type + merchantInfo + country + currency + amountTag + '6304';
    return rawData + crc16(rawData);
}

let lastDotTime = 0; // ตัวแปรสำหรับจำเวลาที่กดปุ่มจุด (.) ล่าสุด

function initGlobalShortcuts() {
    // 1. ดักตอน "กดปุ่มลงไป" (keydown) เพื่อบล็อกไม่ให้มันทำอย่างอื่น
    document.addEventListener('keydown', function(event) {
        const code = event.code;
        const key = event.key;
        
        if (code === 'NumpadAdd' || key === '+' || event.keyCode === 107 || 
            code === 'NumpadDecimal' || key === '.' || event.keyCode === 110) {
            event.preventDefault();  // บล็อกการทำงานพื้นฐาน
            event.stopPropagation(); // หยุดไม่ให้ส่งไปกวนช่อง input
        }
    }, true);

    // 2. ดักตอน "ปล่อยปุ่ม" (keyup) เพื่อสั่งให้ฟังก์ชันทำงาน
    document.addEventListener('keyup', function(event) {
        const code = event.code;
        const key = event.key;

        // --------------------------------------------------
        // 🟢 ปุ่ม [+] (ปุ่ม "รวม") - กดครั้งเดียวทำงานเหมือนเดิม
        // --------------------------------------------------
        if (code === 'NumpadAdd' || key === '+' || event.keyCode === 107) {
            event.preventDefault();
            event.stopPropagation();

            const paymentModal = document.getElementById('paymentModal');
            if (paymentModal && !paymentModal.classList.contains('hidden')) {
                closeModal('paymentModal'); // ปิดหน้าต่างรับเงิน
                setTimeout(() => {
                    const searchInput = document.getElementById('searchInput');
                    if (searchInput) {
                        searchInput.focus();
                        searchInput.value = '';
                    }
                }, 100);
            } else {
                const searchInput = document.getElementById('searchInput');
                if (searchInput) searchInput.blur(); // เอาเคอร์เซอร์ออกกันเหนียว
                handleCheckoutClick(); // เปิดหน้าต่างรับเงิน!
            }
            return false;
        }

        // --------------------------------------------------
        // 🔴 ปุ่ม [.] (ปุ่ม "ราคา") - ต้องกดเบิ้ล 2 ครั้ง (Double-tap)
        // --------------------------------------------------
        if (code === 'NumpadDecimal' || key === '.' || event.keyCode === 110 || event.keyCode === 190) {
            event.preventDefault();
            event.stopPropagation();
            
            const now = Date.now();
            
            // เช็คว่ากดครั้งที่ 2 ห่างจากครั้งแรกไม่เกิน 0.5 วินาที (500ms) ไหม
            if (now - lastDotTime < 500) { 
                // === ทำงานเมื่อกดดับเบิลคลิกสำเร็จ ===
                const paymentModal = document.getElementById('paymentModal');
                if (paymentModal && !paymentModal.classList.contains('hidden')) {
                    closeModal('paymentModal');
                    setTimeout(() => {
                        const searchInput = document.getElementById('searchInput');
                        if (searchInput) { searchInput.focus(); searchInput.value = ''; }
                    }, 100);
                } else {
                    const searchInput = document.getElementById('searchInput');
                    if(searchInput) {
                        searchInput.focus(); 
                        searchInput.value = ''; 
                    }
                }
                
                // คืนค่าเวลาเป็น 0 เพื่อรอรับการกดคู่ใหม่
                lastDotTime = 0; 
            } else {
                // === ถ้าเพิ่งกดครั้งแรก หรือทิ้งช่วงนานเกินไป ให้จดเวลาปัจจุบันไว้ ===
                lastDotTime = now; 
            }
            return false;
        }
    }, true); 
}




function initQuickAddShortcuts() {
     const mPrice = document.getElementById('mPrice');
     mPrice.addEventListener('keydown', function(event) {
         if (event.key === 'Enter') {
             event.preventDefault();
             const mName = document.getElementById('mName');
             const mCode = document.getElementById('mCode');
             if(mName.value.trim() === "") { 
                 mName.value = "สินค้าทั่วไป"; 
             }
             const priceVal = mPrice.value; 
             const codeVal = mCode.value;
             if(priceVal && codeVal) {
                 // 🔴 เอา setLoading ออก เพราะเราจะไม่รอแล้ว
                 const payload = { action: "addMenu", id: codeVal, name: mName.value, price: priceVal, category: document.getElementById('mCategory').value, spicy: "-", image: "", mimeType: "", fileName: "" };
                 sendAddMenu(payload);
             } else { 
                 document.getElementById('btnSaveMenu').click(); 
             }
         }
     });
}

function startOrderPolling() { updateKitchenBadge().finally(() => { setTimeout(startOrderPolling, 3000); }); }

function checkMode() {
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode'); 
    const table = urlParams.get('table');
    
    if (mode === 'customer') {
        isCustomerMode = true; 
        customerTable = table || "ไม่ระบุ";
        
        const adminToolbar = document.getElementById('adminToolbar');
        if(adminToolbar) adminToolbar.classList.add('hidden');
        
        const customerToolbar = document.getElementById('customerToolbar');
        if(customerToolbar) customerToolbar.classList.remove('hidden');
        
        const tableDisplay = document.getElementById('customerTableDisplay');
        if(tableDisplay) tableDisplay.innerText = customerTable;
        
        const tableInput = document.getElementById('tableNo');
        if(tableInput) { 
            tableInput.value = customerTable; 
            tableInput.readOnly = true; 
            tableInput.classList.add('bg-gray-100', 'cursor-not-allowed'); 
        }

        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.placeholder = "พิมพ์ชื่อสินค้าที่ต้องการค้นหา...";
            searchInput.setAttribute('inputmode', 'text');
        }
        
        const searchIcon = document.getElementById('topSearchIcon');
        if (searchIcon) {
            searchIcon.className = 'fas fa-search text-orange-500'; 
        }

        const btnToggleKey = document.getElementById('btnToggleKey');
        if (btnToggleKey) btnToggleKey.classList.add('hidden');

        const floatingSearch = document.getElementById('floatingSearchContainer');
        if (floatingSearch) floatingSearch.classList.add('hidden');

        const holdBillContainer = document.getElementById('holdBillContainer');
        if (holdBillContainer) holdBillContainer.classList.add('hidden');

    } else {
        isCustomerMode = false;
        
        const adminToolbar = document.getElementById('adminToolbar');
        if(adminToolbar) adminToolbar.classList.remove('hidden');
        
        const customerToolbar = document.getElementById('customerToolbar');
        if(customerToolbar) customerToolbar.classList.add('hidden');

        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.placeholder = "ยิงบาร์โค้ด...";
            searchInput.setAttribute('inputmode', 'none');
        }
        
        const searchIcon = document.getElementById('topSearchIcon');
        if (searchIcon) {
            searchIcon.className = 'fas fa-barcode text-gray-400';
        }

        const btnToggleKey = document.getElementById('btnToggleKey');
        if (btnToggleKey) btnToggleKey.classList.remove('hidden');

        const floatingSearch = document.getElementById('floatingSearchContainer');
        if (floatingSearch) floatingSearch.classList.remove('hidden');

        const holdBillContainer = document.getElementById('holdBillContainer');
        if (holdBillContainer) holdBillContainer.classList.remove('hidden');
    }
}

function openQRModal() { 
    document.getElementById('qrModal').classList.remove('hidden');
    const baseUrl = window.location.href.split('?')[0];
    const randomId = Math.floor(Math.random() * 10000); 
    const fullUrl = `${baseUrl}?mode=customer&table=${randomId}`;
    const qrApi = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(fullUrl)}`;
    document.getElementById('qrImage').src = qrApi; document.getElementById('qrLink').href = fullUrl; document.getElementById('qrLink').innerText = fullUrl;
}

function fetchMenu() {
    document.getElementById('loadingMenu').classList.remove('hidden');
    document.getElementById('noResults').classList.add('hidden');
    
    fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: "getMenu" }) })
    .then(res => res.json())
    .then(data => {
        if(data.result === 'success') {
            menuData = data.data; 
            filterMenu('All'); 
            fetchMasterList(); 
        } 
    })
    .finally(() => document.getElementById('loadingMenu').classList.add('hidden'));
}

function fetchMasterList() {
    fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: "getMasterList" }) })
    .then(res => res.json())
    .then(data => {
        if(data.result === 'success') {
            masterData = data.data;
        }
    })
    .catch(err => console.error("โหลดสินค้าทั้งหมดไม่สำเร็จ", err));
}

function processSearchEnter() {
    const searchInput = document.getElementById('searchInput');
    const val = searchInput.value;
    const trimVal = val.trim();

    if(trimVal) { 
        if (/^[0-9]{1,4}$/.test(trimVal)) { 
            addManualItem(parseInt(trimVal)); 
        } else { 
            scanBarcode(trimVal); 
        } 
    } else {
        if (cart.length > 0) { updateQty(0, 1); } 
    }
}

function handleSearchKeydown(event) {
    const searchInput = document.getElementById('searchInput');
    const paymentModal = document.getElementById('paymentModal');

    if (event.key === '+' || event.code === 'NumpadAdd' || event.key === 'Add' || event.keyCode === 107) {
        event.preventDefault(); 
        if (paymentModal && !paymentModal.classList.contains('hidden')) {
            closeModal('paymentModal');
            setTimeout(() => searchInput.focus(), 100); 
        } else {
            searchInput.blur(); 
            handleCheckoutClick();
        }
        return;
    }

    if (event.key === '.' || event.code === 'NumpadDecimal' || event.keyCode === 110 || event.keyCode === 190) {
        event.preventDefault(); 
        if (paymentModal && !paymentModal.classList.contains('hidden')) {
            closeModal('paymentModal');
            setTimeout(() => searchInput.focus(), 100);
        } else {
            searchInput.value = ''; 
        }
        return;
    }

    if (event.key === 'Enter') {
        event.preventDefault(); 
        processSearchEnter(); 
    }
    
    if (searchInput.value === '' && event.key === 'Backspace') { 
        if (cart.length > 0 && cart[0].qty > 1) { updateQty(0, -1); } 
        return; 
    }
}

function checkPaymentEnter(e) { 
    // 🔴 1. แก้ไขปุ่ม + (Add) ให้ทำหน้าที่ "ปิดหน้าต่าง" และกลับไปช่องสแกน
    if (e.key === '+' || e.code === 'NumpadAdd' || e.key === 'Add') { 
        e.preventDefault(); 
        closeModal('paymentModal'); // สั่งปิดหน้าต่างรับเงิน
        
        // ดึงเคอร์เซอร์กลับไปรอที่ช่องค้นหา/ยิงบาร์โค้ด
        setTimeout(() => { 
            const searchInput = document.getElementById('searchInput');
            if (searchInput) {
                searchInput.focus(); 
                searchInput.value = ''; // เคลียร์ค่าที่อาจค้างอยู่
            }
        }, 100);
        return; 
    }

    // 🔴 2. บล็อกปุ่ม . (Decimal) ไม่ให้พิมพ์ในช่องรับเงิน
    if (e.key === '.' || e.code === 'NumpadDecimal' || e.key === 'Decimal') { 
        e.preventDefault(); 
        return; 
    }

    // 🔴 3. บล็อกเลข 0 (Zero) ถ้าช่องว่างอยู่ (กันการพิมพ์ 000)
    if (e.key === '0' || e.code === 'Numpad0') {
        if (e.target.value === '') { 
            e.preventDefault(); 
            return; 
        }
    }

    // ✅ 4. การกด Enter เพื่อยืนยันรับเงิน (โค้ดเดิม)
    if (e.key === 'Enter') { 
        e.preventDefault(); 
        const inputVal = Number(document.getElementById('inputReceived').value);
        
        // ถ้าช่องเงินเป็น 0 หรือว่างเปล่า -> ให้ใส่ยอดพอดีเป๊ะ แล้วปิดบิลเลย
        if (inputVal === 0) {
            setExactMoney();  
            confirmPayment(); 
            return;
        }
        
        // ถ้ามีจำนวนเงินแล้วกด Enter
        if (!document.getElementById('btnConfirmPay').disabled) { 
            confirmPayment(); 
        } else { 
            playNotificationSound(); // เสียงเตือนถ้าเงินไม่ครบ
        } 
    } 
}

function addManualItem(price) {
    const manualItem = { id: "MANUAL-" + Date.now(), name: "สินค้าทั่วไป", price: price, category: "เบ็ดเตล็ด", image: "", isHidden: true };
    addItemToCart(manualItem, "-"); 
    document.getElementById('searchInput').value = ''; 
}

function scanBarcode(code) {
    const cleanCode = String(code).trim();
    const lowerCode = cleanCode.toLowerCase();

    let item = masterData.find(m => String(m.id).trim() === cleanCode);
    if (!item) { item = menuData.find(m => String(m.id).trim() === cleanCode); }
    if (!item) { item = masterData.find(m => m.name.toLowerCase() === lowerCode) || menuData.find(m => m.name.toLowerCase() === lowerCode); }

    if(item) {
        addItemToCart(item, "-"); 
        document.getElementById('searchInput').value = ''; 
        showToast(`เพิ่ม ${item.name} แล้ว`, 'success');
    } else {
        speak("ไม่มี");
        playNotificationSound(); 
        openQuickAddModal(cleanCode);
    }
}

function openQuickAddModal(barcode) {
     openAddMenuModal(); document.getElementById('mCode').value = barcode; document.getElementById('mName').value = ""; document.getElementById('mPrice').value = ""; setTimeout(() => { document.getElementById('mPrice').focus(); }, 300);
}

function searchMenu() { filterMenu('All'); }
function clearSearch() { document.getElementById('searchInput').value = ''; searchMenu(); }

function getCategoryEmoji(category) {
    const map = { 'เครื่องดื่ม': '🥤', 'ขนม/ของว่าง': '🍪', 'ของใช้ในบ้าน': '🏠', 'อาหารแห้ง/เครื่องปรุง': '🧂', 'อาหารสด': '🥩', 'เบ็ดเตล็ด': '🛍️' };
    return map[category] || '📦';
}

function filterMenu(category) {
    let rawInput = document.getElementById('searchInput').value.toLowerCase().trim();
    const clearBtn = document.getElementById('clearSearchBtn');
    if(rawInput) clearBtn.classList.remove('hidden'); else clearBtn.classList.add('hidden');

    let searchText = rawInput;
    const isPrice = /^[0-9]{1,4}$/.test(rawInput) && parseInt(rawInput) > 0;
    if (isPrice) { searchText = ""; } 

    let dataSource = [];
    if (searchText !== "") {
        const combined = new Map();
        if (masterData.length > 0) { masterData.forEach(m => { if(m.id) combined.set(String(m.id), m); }); }
        menuData.forEach(m => { if(m.id) combined.set(String(m.id), m); });
        dataSource = Array.from(combined.values());
        if (dataSource.length === 0) dataSource = menuData;
    } else {
        dataSource = menuData;
    }

    if (category !== 'All' || searchText === '') {
        document.querySelectorAll('.cat-btn').forEach(btn => {
            const isActive = (btn.innerText === category) || (category === 'All' && btn.innerText === 'ทั้งหมด' && searchText === '');
            btn.className = isActive ? "cat-btn bg-gradient-to-r from-orange-500 to-yellow-500 text-white px-6 py-2 rounded-full shadow-lg shadow-orange-200 text-sm font-bold transition transform scale-105 border border-orange-500 shrink-0" : "cat-btn bg-white text-gray-500 hover:bg-orange-50 hover:text-orange-600 px-6 py-2 rounded-full shadow-sm text-sm font-medium transition border border-gray-100 shrink-0";
        });
    }

    let filtered = dataSource;
    if (!searchText) { filtered = filtered.filter(m => !m.isHidden); }
    if (category !== 'All') { filtered = filtered.filter(m => m.category === category); }
    
    if (searchText) {
         filtered = filtered.filter(m => m.name.toLowerCase().includes(searchText) || (m.id && String(m.id).toLowerCase().includes(searchText)) );
         if(category === 'All') { document.querySelectorAll('.cat-btn').forEach(btn => btn.className = "cat-btn bg-white text-gray-600 hover:bg-orange-50 hover:text-orange-600 px-5 py-2 rounded-full shadow-sm text-sm font-medium transition border border-gray-200 shrink-0"); }
    } else if (category === 'All') { 
        filtered.sort((a, b) => categories.indexOf(a.category) - categories.indexOf(b.category)); 
    }

    const grid = document.getElementById('menuGrid'); 
    const noResults = document.getElementById('noResults');
    
    if (filtered.length === 0) {
        grid.classList.add('hidden'); noResults.classList.remove('hidden');
    } else {
        grid.classList.remove('hidden'); noResults.classList.add('hidden');
        grid.innerHTML = filtered.map((item) => {
            const editBtnHtml = isCustomerMode ? '' : `<button onclick="handleEditClick('${item.id}', event)" class="absolute top-2 right-2 bg-white/80 hover:bg-white text-gray-400 hover:text-orange-500 w-8 h-8 rounded-full shadow-sm backdrop-blur-sm z-10 flex items-center justify-center transition-all duration-200"><i class="fas fa-pencil-alt text-xs"></i></button>`;
            const imageUrl = getDriveUrl(item.image);
            const hasImage = imageUrl && imageUrl.length > 10;
            let imageHtml;

            if (hasImage) {
                imageHtml = `<img src="${imageUrl}" class="w-full h-full object-contain p-2 transition duration-500 group-hover:scale-110" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.classList.remove('hidden');"><div class="hidden w-full h-full bg-gray-50 flex flex-col items-center justify-center select-none text-orange-200"><i class="fas fa-box-open text-4xl mb-2 opacity-50"></i><div class="text-4xl">${getCategoryEmoji(item.category)}</div></div>`;
            } else {
                const emoji = getCategoryEmoji(item.category);
                imageHtml = `<div class="w-full h-full bg-gray-50 flex flex-col items-center justify-center select-none text-orange-200 group-hover:bg-orange-50 transition-colors"><i class="fas fa-box-open text-3xl sm:text-4xl mb-2 opacity-30 group-hover:opacity-50 transition-opacity"></i><div class="text-3xl sm:text-4xl filter drop-shadow-sm group-hover:scale-110 transition-transform duration-300">${emoji}</div></div>`;
            }

            return `
            <div class="bg-white rounded-3xl shadow-[0_2px_10px_rgba(0,0,0,0.03)] hover:shadow-[0_10px_25px_rgba(0,0,0,0.08)] transition-all duration-300 cursor-pointer overflow-hidden border border-gray-100 group relative transform hover:-translate-y-1" onclick="handleAddToCart('${item.id}')">
                ${editBtnHtml}
                <div class="w-full aspect-[16/9] bg-white relative overflow-hidden flex items-center justify-center p-2">${imageHtml}</div>
                <div class="p-4 pt-3 flex flex-col justify-between min-h-[110px]">
                    <h3 class="font-bold text-gray-700 text-sm sm:text-base leading-snug line-clamp-2 mb-2 h-10 group-hover:text-orange-600 transition-colors">${item.name}</h3>
                    <div class="flex justify-between items-end mt-1">
                        <div class="flex flex-col"><span class="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-[-2px]">ราคา</span><div class="flex items-baseline gap-1"><span class="text-3xl font-extrabold text-gray-800 tracking-tight leading-none group-hover:text-orange-600 transition-colors">${item.price}</span><span class="text-xs text-gray-400 font-bold">฿</span></div></div>
                        <div class="w-10 h-10 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center group-hover:bg-orange-500 group-hover:text-white transition-all shadow-sm group-hover:shadow-lg active:scale-90"><i class="fas fa-plus text-sm font-bold"></i></div>
                    </div>
                </div>
            </div>`;
        }).join('');
    }
}

function handleAddToCart(itemId) {
    let item = masterData.find(m => m.id == itemId) || menuData.find(m => m.id == itemId);
    if (item) { addItemToCart(item, "-"); } else { console.error("Item not found:", itemId); }
}

function handleEditClick(itemId, e) {
    e.stopPropagation();
    let item = masterData.find(m => m.id == itemId) || menuData.find(m => m.id == itemId);
    if (item) {
        document.getElementById('editMenuModal').classList.remove('hidden'); 
        document.getElementById('eId').value = item.id; document.getElementById('eName').value = item.name; document.getElementById('ePrice').value = item.price; document.getElementById('eCategory').value = item.category;
    }
}

function toggleCart(show) {
    const panel = document.getElementById('cartPanel'); const mobileBar = document.getElementById('mobileBottomBar');
    if (show) { panel.classList.remove('hidden'); panel.classList.add('flex', 'fixed', 'inset-0', 'z-50'); mobileBar.classList.add('translate-y-[150%]'); } 
    else { if(window.innerWidth < 1024) { panel.classList.add('hidden'); panel.classList.remove('flex', 'fixed', 'inset-0', 'z-50'); if(cart.length > 0) mobileBar.classList.remove('translate-y-[150%]'); } }
}

function addToCart(index) { const item = menuData[index]; addItemToCart(item, "-"); }

function addItemToCart(item, spicy) {
    const existingIndex = cart.findIndex(c => c.id === item.id);
    if (existingIndex !== -1) {
        const existingItem = cart[existingIndex]; existingItem.qty++; cart.splice(existingIndex, 1); cart.unshift(existingItem); speak(existingItem.qty.toString());
    } else { cart.unshift({ ...item, qty: 1, spicy: '-' }); speak(item.price + " บาท"); }
    renderCart(); if(window.navigator.vibrate) window.navigator.vibrate(50);
}

function renderCart() {
    const container = document.getElementById('cartItems'); 
    const totalEl = document.getElementById('totalPrice'); 
    const btnMobile = document.getElementById('btnOrderMobile');
    const btnDesktop = document.getElementById('btnOrderDesktop'); 
    const countEl = document.getElementById('cartCountDesktop'); 
    const mobileBar = document.getElementById('mobileBottomBar'); 
    const mobileCount = document.getElementById('mobileCartCount'); 
    const mobileTotal = document.getElementById('mobileCartTotal');
    const miniTotal = document.getElementById('miniTotalDisplay');
    const changeWrapper = document.getElementById('changeWrapper');
    
    if(cart.length === 0) {
        container.innerHTML = '<div class="h-full flex flex-col items-center justify-center text-gray-400 opacity-60"><i class="fas fa-cash-register text-6xl mb-4 text-orange-200"></i><p>สแกนสินค้า หรือ กดปุ่มเพื่อเปิด QR รับเงิน</p></div>';
        countEl.innerText = "0 รายการ"; 
        mobileBar.classList.add('translate-y-[150%]'); 
        
        if(totalEl) totalEl.innerText = "0";
        if(mobileTotal) mobileTotal.innerText = "0 ฿";
        if(miniTotal) miniTotal.innerText = "0 ฿";

        if(btnDesktop) {
             btnDesktop.className = "h-12 bg-gradient-to-b from-gray-400 to-gray-500 text-white font-bold text-lg rounded-lg shadow-sm border-b-4 border-gray-600 transition-all flex flex-col items-center justify-center gap-1 cursor-not-allowed";
             btnDesktop.disabled = true;
             btnDesktop.innerHTML = '<span class="text-xs font-normal opacity-80">ว่าง</span>';
        }

        if(btnMobile) {
            btnMobile.innerHTML = '<span>QR รับเงิน</span> <i class="fas fa-qrcode"></i>';
            btnMobile.className = "w-full bg-gradient-to-r from-green-600 to-green-700 text-white font-bold py-3.5 rounded-xl shadow-lg transition flex justify-center items-center gap-2";
        }
        return; 
    }
    
    if(changeWrapper) {
        changeWrapper.classList.add('hidden', 'opacity-0', 'translate-y-4');
        changeWrapper.classList.remove('flex', 'opacity-100', 'translate-y-0');
    }

    if(totalEl) {
        totalEl.classList.remove('text-4xl', 'translate-y-[-5px]'); 
        totalEl.classList.add('text-7xl'); 
    }
    
    let btnClassDesktop = ""; let btnHtmlDesktop = ""; let btnHtmlMobile = ""; let btnClassMobile = "";

    if (isCustomerMode) {
        btnClassDesktop = "hidden";
        btnHtmlMobile = '<span>ยืนยันรายการ</span> <i class="fas fa-check-circle"></i>';
        btnClassMobile = "w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold py-3.5 rounded-xl shadow-lg transition transform active:scale-95 flex justify-center items-center gap-2";
    } else {
        btnClassDesktop = "h-12 bg-gradient-to-b from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-bold text-lg rounded-lg shadow-md border-b-4 border-orange-800 active:border-b-0 active:translate-y-1 transition-all flex flex-col items-center justify-center gap-1";
        btnHtmlDesktop = '<span class="text-xs font-normal opacity-80"></span><i class="fas fa-check-circle text-2xl"></i>';
        btnHtmlMobile = '<span>คิดเงิน</span> <i class="fas fa-arrow-right"></i>';
        btnClassMobile = "w-full bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-600 hover:to-yellow-600 text-white font-bold py-3.5 rounded-xl shadow-lg transition transform active:scale-95 flex justify-center items-center gap-2";
    }

    if(btnDesktop) { btnDesktop.disabled = false; btnDesktop.className = btnClassDesktop; btnDesktop.innerHTML = btnHtmlDesktop; }
    if(btnMobile) { btnMobile.innerHTML = btnHtmlMobile; btnMobile.className = btnClassMobile; }

    let total = 0; let count = 0;
    container.innerHTML = cart.map((item, idx) => {
        total += item.price * item.qty; count += item.qty;
        
        // เพิ่ม onclick="removeFromCart(idx)" ที่ div กล่องนอกสุด 
        // และเพิ่ม hover:bg-red-50 เพื่อให้กล่องเปลี่ยนเป็นสีแดงอ่อนๆ เวลากด/ชี้
        return `
        <div onclick="removeFromCart(${idx})" class="flex justify-between items-start bg-white p-3 rounded-xl border border-gray-100 shadow-sm mb-2 animate-fade-in cursor-pointer hover:bg-red-50 transition-colors group">
            <div class="flex-1">
                <h4 class="font-bold text-gray-800 leading-tight group-hover:text-red-600 transition-colors">${item.name}</h4>
                <div class="text-xs text-gray-500 mt-1 flex gap-2"><span>${item.price}.-</span></div>
            </div>
            <div class="flex flex-col items-end gap-2">
                <div class="font-bold text-orange-600">${item.price * item.qty}</div>
                
                <div class="flex items-center bg-gray-100 rounded-lg p-0.5 gap-1" onclick="event.stopPropagation()">
                    <button onclick="removeFromCart(${idx})" class="w-7 h-7 flex items-center justify-center text-red-500 hover:bg-red-100 rounded-md transition"><i class="fas fa-trash-alt text-xs"></i></button>
                    <div class="w-px h-4 bg-gray-300 mx-1"></div>
                    <button onclick="updateQty(${idx}, -1)" class="w-7 h-7 flex items-center justify-center text-gray-500 hover:bg-white hover:shadow rounded-md transition">-</button>
                    <span class="w-6 text-center font-bold text-sm text-gray-800">${item.qty}</span>
                    <button onclick="updateQty(${idx}, 1)" class="w-7 h-7 flex items-center justify-center text-green-600 hover:bg-white hover:shadow rounded-md transition">+</button>
                </div>
            </div>
        </div>`;
    }).join('');
    
    const totalTxt = total.toLocaleString() + "";
    totalEl.innerText = totalTxt; countEl.innerText = count + " รายการ"; 
    mobileCount.innerText = count; mobileTotal.innerText = totalTxt + " ฿";
    if(miniTotal) miniTotal.innerText = totalTxt + " ฿";
    
    const isDrawerOpen = !document.getElementById('cartPanel').classList.contains('hidden');
    if (!isDrawerOpen && window.innerWidth < 1024) { mobileBar.classList.remove('translate-y-[150%]'); }
}

function updateQty(idx, change) { cart[idx].qty += change; if(cart[idx].qty > 0) { speak(cart[idx].qty.toString()); } if (cart[idx].qty <= 0) cart.splice(idx, 1); renderCart(); }
function removeFromCart(idx) { cart.splice(idx, 1); renderCart(); }

function handleCheckoutClick() { 
    if (cart.length === 0) { quickCheckout(); return; }
    if (isCustomerMode) { isQuickPayMode = false; openConfirmOrderModal(); } else { quickCheckout(); } 
}

function quickCheckout() {
    isQuickPayMode = true;
    const total = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
    currentPayOrder = { orderId: null, totalPrice: total };
    
    const tableContainer = document.getElementById('quickPayTableNoContainer');
    if (tableContainer) tableContainer.classList.add('hidden'); 
    
    try { initBankQR(); } catch(e) { console.log("QR Init Error", e); }
    
    const modal = document.getElementById('paymentModal');
    if (modal) modal.classList.remove('hidden'); 

    const leftPanel = document.getElementById('leftPanel');
    if(leftPanel) leftPanel.classList.add('blur-sm', 'opacity-50', 'pointer-events-none');

    const modalTotal = document.getElementById('modalTotalPay');
    if(modalTotal) modalTotal.innerText = total.toLocaleString();
    
    const modalChangeBox = document.getElementById('modalChangeBox');
    if(modalChangeBox) {
        modalChangeBox.classList.add('opacity-0', 'translate-y-2'); 
        modalChangeBox.innerHTML = `เงินทอน: <span id="modalChangePay" class="text-green-600 text-5xl font-extrabold ml-2 drop-shadow-sm animate-heartbeat">0</span> <span class="ml-1 text-sm">฿</span>`;
    }

    const inputRec = document.getElementById('inputReceived');
    if (inputRec) { inputRec.value = ''; setTimeout(() => { inputRec.focus(); }, 100); }
    
    const totalPriceEl = document.getElementById('totalPrice');
    const changeWrapper = document.getElementById('changeWrapper');
    if (totalPriceEl) { totalPriceEl.classList.remove('text-4xl', 'translate-y-[-10px]'); totalPriceEl.classList.add('text-7xl'); }
    if (changeWrapper) { changeWrapper.classList.add('hidden', 'opacity-0', 'translate-y-4'); changeWrapper.classList.remove('flex', 'opacity-100', 'translate-y-0'); }
    
    const btnConfirm = document.getElementById('btnConfirmPay');
    if (btnConfirm) { btnConfirm.disabled = false; btnConfirm.classList.remove('opacity-50', 'cursor-not-allowed'); }

    if (total > 0) { speak("ยอดรวม " + total + " บาท"); }
}

function openConfirmOrderModal() {
    document.getElementById('confirmOrderModal').classList.remove('hidden');
    document.getElementById('summaryList').innerHTML = cart.map(i => `<div class="flex justify-between border-b border-gray-200 border-dashed py-2 last:border-0"><span class="text-gray-700 text-sm">${i.name} x${i.qty}</span><span class="font-bold text-gray-800">${i.price*i.qty}</span></div>`).join('') + `<div class="flex justify-between font-bold mt-3 pt-3 border-t text-orange-600 text-lg"><span>รวมทั้งหมด</span><span>${document.getElementById('totalPrice').innerText}</span></div>`;
    
    const typeSelect = document.getElementById('orderType');
    const typeDiv = typeSelect.parentElement; 
    const addressSection = document.getElementById('addressSection');
    const tableDiv = document.getElementById('tableNo').parentElement; 
    const tableInput = document.getElementById('tableNo');

    if (isCustomerMode) {
        typeSelect.value = "ส่งเดลิเวอรี่"; typeDiv.classList.add('hidden'); tableDiv.classList.add('hidden'); addressSection.classList.add('hidden'); 
        const cName = localStorage.getItem('customerName') || 'ลูกค้า'; const cPhone = localStorage.getItem('customerPhone') || '-'; const savedHouse = localStorage.getItem('customerAddrHouse') || ''; const savedSoi = localStorage.getItem('customerAddrSoi') || '';
        const addressStr = `[ส่งที่: ${savedHouse} ${savedSoi ? 'ซ.' + savedSoi : ''}]`;
        tableInput.value = `${cName} (${cPhone}) ${addressStr}`;
        document.getElementById('addrHouseNo').value = savedHouse; document.getElementById('addrSoi').value = savedSoi;
    } else {
        typeDiv.classList.remove('hidden'); tableDiv.classList.remove('hidden'); toggleAddressFields(); 
        tableDiv.querySelector('label').innerText = "ชื่อลูกค้า / คิวที่"; tableInput.placeholder = "เช่น 1 หรือ A";
    }
}

function toggleAddressFields() {
    const type = document.getElementById('orderType').value; 
    const addrSection = document.getElementById('addressSection');
    if (type === 'ส่งเดลิเวอรี่') { addrSection.classList.remove('hidden'); } else { addrSection.classList.add('hidden'); }
}

function submitOrder() {
    setLoading('btnSubmitOrder', true, 'กำลังบันทึก...');
    const total = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
    if (isCustomerMode && total < 100) { return; }
    if (isCustomerMode) { speak("ยอดรวม " + total.toLocaleString() + " บาท"); }
    
    const orderType = document.getElementById('orderType').value;
    let noteText = document.getElementById('orderNote').value.trim(); 
    let finalTableNo = document.getElementById('tableNo').value; 
    
    if (orderType === 'ส่งเดลิเวอรี่') {
        const houseNo = document.getElementById('addrHouseNo').value.trim(); const soi = document.getElementById('addrSoi').value.trim();
        if (isCustomerMode && (!houseNo || !soi)) { 
             showCustomAlert('ข้อมูลที่อยู่ขาดหาย', 'กรุณารีเฟรชหน้าแล้วกรอกชื่อ/เบอร์ใหม่อีกครั้งค่ะ', '<i class="fas fa-map-marked-alt text-red-500"></i>');
             setLoading('btnSubmitOrder', false, 'ยืนยันรายการ'); return; 
        }
    }

    const payload = { action: "saveOrder", tableNo: finalTableNo || "หน้าร้าน", orderType: orderType, cartItems: cart.map(i => ({ name: i.name, qty: i.qty, price: i.price, spicy: "-" })), totalPrice: total, note: noteText };
    
     fetch(API_URL, { method: 'POST', body: JSON.stringify(payload) }).then(res => res.json()).then(data => {
        if(data.result === 'success') {
            myLastOrders = { items: [...cart], total: total, note: noteText, timestamp: new Date().toISOString() }; 
            showToast('บันทึกรายการขายแล้ว!', 'success'); 
            if (isCustomerMode) { setTimeout(() => speak("ขอบคุณค่ะ"), 1500); } else { speak("บันทึกรายการแล้วค่ะ"); }
            cart = []; renderCart(); toggleCart(false); closeModal('confirmOrderModal'); 
            if(!isCustomerMode) document.getElementById('tableNo').value = '';
            document.getElementById('orderNote').value = ''; document.getElementById('addrHouseNo').value = ''; document.getElementById('addrSoi').value = '';
            if(isCustomerMode) openMyRecentOrder(); updateKitchenBadge();
        } else if (data.error === 'STORE_CLOSED') {
            document.getElementById('storeClosedModal').classList.remove('hidden'); isStoreOpen = false; updateStoreUI(); speak("ขออภัย ร้านปิดแล้วค่ะ"); closeModal('confirmOrderModal'); 
        } else { showCustomAlert('ผิดพลาด', 'ส่งออเดอร์ไม่สำเร็จ: ' + data.error, '<i class="fas fa-exclamation-circle text-red-500"></i>'); }
    }).catch(err => showCustomAlert('Connection Error', 'ตรวจสอบอินเทอร์เน็ตของคุณ')).finally(() => setLoading('btnSubmitOrder', false, 'ยืนยันรายการ'));
}

function updateKitchenBadge() { 
    return fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: "getOrders" }) }).then(res => res.json()).then(data => { 
        if (data.result === 'success') { 
            if (data.isStoreOpen !== undefined) {
                isStoreOpen = data.isStoreOpen; updateStoreUI(); 
                if (isCustomerMode && !isStoreOpen) { document.getElementById('storeClosedModal').classList.remove('hidden'); } else if (isCustomerMode && isStoreOpen) { document.getElementById('storeClosedModal').classList.add('hidden'); }
            }
            const waitingOrders = data.data.filter(o => o.status !== 'Served'); 
            const waitingCount = waitingOrders.length; 
            const badge = document.getElementById('kitchenBadge'); 
            if (waitingCount > 0) { badge.innerText = waitingCount; badge.classList.remove('hidden'); } else { badge.classList.add('hidden'); } 
            
            if (!isCustomerMode) {
                const isKitchenModalOpen = !document.getElementById('kitchenModal').classList.contains('hidden');
                if (lastOrderCount !== -1 && waitingCount > lastOrderCount) { playNotificationSound(); showToast('มีรายการใหม่เข้ามา!', 'warning'); }
                if (isKitchenModalOpen && waitingCount !== lastOrderCount) { currentOrders = data.data; renderKitchen(currentOrders); }
            }
            lastOrderCount = waitingCount; 
            if (isCustomerMode) { 
                document.getElementById('queueCountDisplay').innerText = waitingCount; 
                const cName = localStorage.getItem('customerName') || 'ลูกค้า'; const cPhone = localStorage.getItem('customerPhone') || '-'; const savedHouse = localStorage.getItem('customerAddrHouse') || ''; const savedSoi = localStorage.getItem('customerAddrSoi') || '';
                const addressStr = `[ส่งที่: ${savedHouse} ${savedSoi ? 'ซ.' + savedSoi : ''}]`;
                const myIdentity = `${cName} (${cPhone}) ${addressStr}`; 
                const myOrders = data.data.filter(o => o.tableNo === myIdentity);
                myOrders.forEach(order => {
                    if (order.status === 'Served' && !notifiedOrders.has(order.orderId)) {
                        document.getElementById('deliveryNotificationModal').classList.remove('hidden');
                        playNotificationSound(); speak("สินค้ากำลังไปส่งค่ะ"); notifiedOrders.add(order.orderId); 
                    }
                });
            }
        } 
    }).catch(e=>{}); 
}

function openKitchenModal() { document.getElementById('kitchenModal').classList.remove('hidden'); fetchOrders(); }

function fetchOrders() { const grid = document.getElementById('kitchenGrid'); grid.innerHTML = '<div class="col-span-full text-center py-20"><i class="fas fa-circle-notch fa-spin text-4xl text-orange-500"></i><p class="mt-2 text-gray-400">กำลังโหลดรายการ...</p></div>'; fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: "getOrders" }) }).then(res => res.json()).then(data => { if (data.result === 'success') { currentOrders = data.data; renderKitchen(currentOrders); updateKitchenBadge(); } else { grid.innerHTML = `<div class="col-span-full text-center text-red-500">Error: ${data.error}</div>`; } }); }

function renderKitchen(orders) { 
    const grid = document.getElementById('kitchenGrid'); 
    grid.innerHTML = ''; 
    if(!orders || orders.length === 0) { 
        grid.innerHTML = '<div class="col-span-full flex flex-col items-center justify-center text-gray-300 py-20 animate-fade-in"><i class="fas fa-clipboard-check text-6xl mb-4"></i><p>ไม่มีรายการค้างส่ง</p></div>'; return; 
    } 
    grid.innerHTML = orders.map(order => { 
        const isServed = order.status === 'Served'; 
        const isTakeAway = order.orderType === 'ส่งเดลิเวอรี่'; 
        const cardBorder = isServed ? 'border-green-400' : (isTakeAway ? 'border-red-400' : 'border-orange-400');
        const headerBg = isServed ? 'bg-green-500' : (isTakeAway ? 'bg-red-500' : 'bg-orange-500');
        const bgClass = isServed ? 'bg-green-50' : 'bg-white';
        const timeDiff = Math.floor((new Date() - new Date(order.timestamp)) / 60000);
        let timeAgoText = timeDiff < 1 ? 'เมื่อสักครู่' : `${timeDiff} นาทีที่แล้ว`;
        if(timeDiff > 15 && !isServed) timeAgoText = `<span class="text-red-500 font-bold animate-pulse"><i class="fas fa-exclamation-circle"></i> ${timeAgoText}</span>`;

        return `
        <div class="${bgClass} border-2 ${cardBorder} rounded-2xl shadow-lg relative flex flex-col animate-slide-up overflow-hidden">
            <div class="${headerBg} p-3 text-white flex justify-between items-center shadow-md">
                <div class="flex items-center gap-3"><div class="bg-white/20 px-3 py-1 rounded-lg text-center min-w-[50px]"><div class="text-[10px] font-bold opacity-80">คิว/โต๊ะ</div><div class="text-2xl font-extrabold leading-none">${order.tableNo}</div></div><span class="text-sm font-bold bg-black/20 px-2 py-0.5 rounded-md border border-white/10">${order.orderType}</span></div>
                <div class="text-right"><div class="font-mono font-bold text-lg leading-none">${new Date(order.timestamp).toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'})}</div><div class="text-[10px] font-medium mt-0.5 opacity-90">${timeAgoText}</div></div>
            </div>
            <div class="p-4 flex-1 flex flex-col gap-3">
                ${order.note ? `<div class="bg-yellow-100 border-l-4 border-yellow-400 text-yellow-900 text-xs p-2 rounded-r font-bold"><i class="fas fa-comment-dots"></i> ${order.note}</div>` : ''}
                <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div class="flex text-[10px] text-gray-500 font-bold bg-gray-100 px-3 py-2 border-b border-gray-200 uppercase tracking-wide"><div class="flex-1">ชื่อสินค้า</div><div class="w-14 text-right">หน่วยละ</div><div class="w-12 text-center">จำนวน</div><div class="w-16 text-right">รวม</div></div>
                    <div class="divide-y divide-gray-100 max-h-[250px] overflow-y-auto custom-scrollbar">
                        ${(order.items || []).map(i => `<div class="flex items-center px-3 py-2.5 hover:bg-gray-50 transition"><div class="flex-1 font-bold text-gray-700 text-sm pr-2 leading-tight">${i.name}</div><div class="w-14 text-right text-xs text-gray-400 font-mono">${i.price}</div><div class="w-12 text-center"><span class="text-lg font-extrabold text-gray-800">${i.qty}</span></div><div class="w-16 text-right font-bold text-orange-600 text-sm">${(i.price * i.qty).toLocaleString()}</div></div>`).join('')}
                    </div>
                    <div class="bg-gray-50 px-3 py-2 border-t border-gray-200 flex justify-between items-center"><span class="text-xs font-bold text-gray-500">ยอดสุทธิ</span><span class="text-lg font-extrabold text-orange-600">${order.totalPrice.toLocaleString()} ฿</span></div>
                </div>
            </div>
            <div class="p-3 bg-gray-50 border-t border-gray-200 flex gap-2">
                ${!isServed ? `<button onclick="markServed('${order.orderId}', this)" class="flex-1 bg-orange-500 hover:bg-orange-600 text-white py-2.5 rounded-xl font-bold text-base shadow transition transform active:scale-95"><i class="fas fa-check-circle"></i> จัดเสร็จ</button>` : `<div class="flex-1 text-center text-green-600 font-bold py-2.5 bg-green-100 rounded-xl border border-green-200"><i class="fas fa-check-double"></i> เรียบร้อย</div>`}
                <button onclick="openPayment('${order.orderId}')" class="flex-1 bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-xl font-bold text-base shadow transition transform active:scale-95">ชำระเงิน</button>
            </div>
        </div>`; 
    }).join(''); 
}

function markServed(orderId, btn) { const originalContent = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>'; fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: "updateOrderStatus", orderId: orderId, status: "Served" }) }).then(() => { fetchOrders(); showToast('สถานะอัปเดตแล้ว', 'success'); }).catch(() => { btn.disabled = false; btn.innerHTML = originalContent; }); }

function openPayment(orderId) { 
    currentPayOrder = currentOrders.find(o => String(o.orderId) === String(orderId)); 
    if(!currentPayOrder) { showCustomAlert('ผิดพลาด', 'ไม่พบข้อมูลออเดอร์นี้'); return; } 
    cart = JSON.parse(JSON.stringify(currentPayOrder.items)); renderCart(); toggleCart(true); closeModal('kitchenModal');
    isQuickPayMode = false; document.getElementById('quickPayTableNoContainer').classList.add('hidden');
    initBankQR(); document.getElementById('paymentModal').classList.remove('hidden'); 
    const leftPanel = document.getElementById('leftPanel'); if(leftPanel) leftPanel.classList.add('blur-sm', 'opacity-50', 'pointer-events-none');
    const totalEl = document.getElementById('modalTotalPay'); if(totalEl) { totalEl.innerText = currentPayOrder.totalPrice.toLocaleString(); }
    const inputRec = document.getElementById('inputReceived'); if(inputRec) { inputRec.value = ''; setTimeout(() => { inputRec.focus(); }, 300); }
    const modalChangeBox = document.getElementById('modalChangeBox'); if(modalChangeBox) { modalChangeBox.classList.add('opacity-0', 'translate-y-2'); const changeTxt = document.getElementById('modalChangePay'); if(changeTxt) changeTxt.innerText = "0"; }
    const btnConfirm = document.getElementById('btnConfirmPay'); if(btnConfirm) { btnConfirm.disabled = false; btnConfirm.classList.remove('opacity-50', 'cursor-not-allowed'); }
    speak("ยอดรวม " + currentPayOrder.totalPrice + " บาท"); setTimeout(() => { document.getElementById('inputReceived').focus(); }, 100);
}

function addMoney(amount) { const input = document.getElementById('inputReceived'); input.value = Number(input.value) + amount; calcChange(); }
function setExactMoney() { document.getElementById('inputReceived').value = currentPayOrder.totalPrice; calcChange(); }
function clearMoney() { document.getElementById('inputReceived').value = ''; calcChange(); }

let ttsTimer = null;

function calcChange() { 
    const total = currentPayOrder.totalPrice; 
    const inputEl = document.getElementById('inputReceived');
    const received = Number(inputEl.value); 
    const change = received - total; 
    const btn = document.getElementById('btnConfirmPay'); 
    const modalChangeBox = document.getElementById('modalChangeBox');
    const mainChangeWrapper = document.getElementById('changeWrapper');
    const mainChangeText = document.getElementById('mainScreenChange');
    const mainTotalEl = document.getElementById('totalPrice'); 

    if(mainChangeWrapper && mainChangeText) {
        if (received > 0) {
            mainChangeWrapper.classList.remove('hidden', 'opacity-0', 'translate-y-4'); mainChangeWrapper.classList.add('flex', 'opacity-100', 'translate-y-0');
            if(mainTotalEl) { mainTotalEl.classList.remove('text-7xl'); mainTotalEl.classList.add('text-4xl', 'translate-y-[-5px]'); }
            if (change >= 0) { mainChangeText.innerText = change.toLocaleString() + ""; mainChangeText.classList.remove('text-red-500'); mainChangeText.classList.add('text-green-600'); } 
            else { mainChangeText.innerText = "-" + Math.abs(change).toLocaleString(); mainChangeText.classList.remove('text-green-600'); mainChangeText.classList.add('text-red-500'); }
        } else {
            mainChangeWrapper.classList.add('hidden', 'opacity-0', 'translate-y-4'); mainChangeWrapper.classList.remove('flex', 'opacity-100', 'translate-y-0');
            if(mainTotalEl) { mainTotalEl.classList.remove('text-4xl', 'translate-y-[-5px]'); mainTotalEl.classList.add('text-7xl'); }
        }
    }

    if(received >= total && total > 0) {
        if(modalChangeBox) { modalChangeBox.classList.remove('opacity-0', 'translate-y-2'); modalChangeBox.innerHTML = `เงินทอน: <span class="text-green-600 text-5xl font-extrabold ml-2 drop-shadow-sm animate-heartbeat">${change.toLocaleString()}</span> <span class="ml-1 text-sm">฿</span>`; }
        
        // 🔴 ปรับปรุงเงื่อนไขให้พูด "ขอบคุณค่ะ" เวลารับเงินพอดี 🔴
        if (change >= 0) { 
            clearTimeout(ttsTimer); 
            ttsTimer = setTimeout(() => { 
                if (change > 0) {
                    speak("รับเงิน " + received + " บาท เงินทอน " + change + " บาท"); 
                } else {
                 // <--- เปลี่ยนตรงนี้แล้วครับ
                }
            }, 800); 
        }
    } else { 
        if(modalChangeBox && received > 0) { const missing = Math.abs(change); modalChangeBox.classList.remove('opacity-0', 'translate-y-2'); modalChangeBox.innerHTML = `-: <span class="text-red-500 text-4xl font-extrabold ml-2 animate-heartbeat">${missing.toLocaleString()}</span> <span class="ml-1 text-sm">฿</span>`; } 
        else if (modalChangeBox) { modalChangeBox.classList.add('opacity-0', 'translate-y-2'); }
    } 
    
    if(btn) { btn.disabled = false; btn.classList.remove('opacity-50', 'cursor-not-allowed'); }
    if(received >= total) { inputEl.classList.replace('border-orange-500', 'border-green-500'); inputEl.classList.replace('text-orange-600', 'text-green-600'); } 
    else { inputEl.classList.replace('border-green-500', 'border-orange-500'); inputEl.classList.replace('text-green-600', 'text-orange-600'); }
}



function confirmPayment() { 
    const inputRec = document.getElementById('inputReceived');
    let received = Number(inputRec.value); 
    if (!currentPayOrder) { showCustomAlert('Error', 'ข้อมูลผิดพลาด กรุณาปิดหน้าต่างแล้วลองใหม่'); return; }
    const total = currentPayOrder.totalPrice; 
    if (received === 0) { received = total; inputRec.value = total; }
    if (received < total) { showToast('ยอดเงินไม่ครบ', 'warning'); playNotificationSound(); inputRec.classList.add('animate-pulse', 'bg-red-100'); setTimeout(() => inputRec.classList.remove('animate-pulse', 'bg-red-100'), 500); return; }

    const orderId = currentPayOrder.orderId; const finalChange = received - total; 
    closeModal('paymentModal'); 
    const leftPanel = document.getElementById('leftPanel'); if(leftPanel) leftPanel.classList.remove('blur-sm', 'opacity-50', 'pointer-events-none'); 
    
    // ตรงนี้มีคำสั่งพูดขอบคุณอยู่แล้ว
    speak("ขอบคุณค่ะ");
    
    if(inputRec) inputRec.value = ''; 
    const modalChangeBox = document.getElementById('modalChangeBox'); if(modalChangeBox) { modalChangeBox.classList.add('opacity-0', 'translate-y-2'); const modalChange = document.getElementById('modalChangePay'); if(modalChange) modalChange.innerText = "0"; }
    
    let payload = {}; let itemsToSave = [];
    if (isQuickPayMode) { 
         itemsToSave = cart.map(i => ({ name: i.name, qty: i.qty, price: i.price })); 
         const quickPayInput = document.getElementById('quickPayTableNo');
         let customName = (quickPayInput ? quickPayInput.value : "").trim(); 
         if(!customName) customName = "Walk-in"; 
         payload = { action: "processPayment", tableNo: customName, finalPrice: total, received: received, change: finalChange, directItems: itemsToSave };
    } else {
        payload = { action: "processPayment", orderId: orderId, tableNo: currentPayOrder.tableNo, orderType: currentPayOrder.orderType, items: currentPayOrder.items, finalPrice: total, received: received, change: finalChange };
    }

    cart = []; toggleCart(false); renderCart();  

    setTimeout(() => {
        const totalEl = document.getElementById('totalPrice'); const changeWrapper = document.getElementById('changeWrapper'); const mainScreenChange = document.getElementById('mainScreenChange');
        if(totalEl) { totalEl.innerText = total.toLocaleString() + " ฿"; totalEl.classList.remove('text-7xl'); totalEl.classList.add('text-4xl', 'translate-y-[-5px]'); }
        if(changeWrapper && mainScreenChange) {
            mainScreenChange.innerText = finalChange.toLocaleString() + " ฿"; mainChangeText = mainScreenChange; 
            mainScreenChange.classList.remove('text-red-500'); mainScreenChange.classList.add('text-green-600');
            changeWrapper.classList.remove('hidden', 'opacity-0', 'translate-y-4'); changeWrapper.classList.add('flex', 'opacity-100', 'translate-y-0');
        }
    }, 50);

    sendPaymentRequest(payload, isQuickPayMode);
    
    setTimeout(() => {
        if(cart.length === 0) {
             const totalEl = document.getElementById('totalPrice'); const changeWrapper = document.getElementById('changeWrapper');
             if(changeWrapper) { changeWrapper.classList.add('hidden', 'opacity-0', 'translate-y-4'); changeWrapper.classList.remove('flex', 'opacity-100', 'translate-y-0'); }
             if(totalEl) { totalEl.innerText = "0"; totalEl.classList.remove('text-4xl', 'translate-y-[-5px]'); totalEl.classList.add('text-7xl'); }
        }
        
        // 🔴 สิ่งที่เพิ่มเข้ามา: บังคับ Cursor กลับไปที่ช่องสแกนบาร์โค้ดหลังจากปิดหน้าต่างคิดเงิน 🔴
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.focus();
            searchInput.value = ''; // เคลียร์ช่องให้ว่างพร้อมสแกนชิ้นต่อไป
        }
    }, 300); // รอให้หน้าต่าง Payment ปิดสนิทก่อนค่อยดึง Focus
}

function sendPaymentRequest(payload, isQuickPay) {
    fetch(API_URL, { method: 'POST', body: JSON.stringify(payload) })
    .then(res => res.json())
    .then(data => { 
        if(data.result === 'success') { showToast('ชำระเงินเรียบร้อย', 'success'); if (!isQuickPay) { fetchOrders(); } } 
        else { showCustomAlert('ผิดพลาด', 'บันทึกไม่สำเร็จ: ' + data.error); }
    })
    .catch(err => { showCustomAlert('Connection Error', 'ไม่สามารถติดต่อเซิร์ฟเวอร์ได้'); });
}

function openEditMenu(index, e) { e.stopPropagation(); const item = menuData[index]; document.getElementById('editMenuModal').classList.remove('hidden'); document.getElementById('eId').value = item.id; document.getElementById('eName').value = item.name; document.getElementById('ePrice').value = item.price; document.getElementById('eCategory').value = item.category; }
function openAddMenuModal() { document.getElementById('addModal').classList.remove('hidden'); }
function openSalesModal() { document.getElementById('salesModal').classList.remove('hidden'); document.getElementById('saleToday').innerText = '...'; fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: "getSalesStats" }) }).then(r=>r.json()).then(d => { document.getElementById('saleToday').innerText = d.today.toLocaleString(); document.getElementById('saleYest').innerText = d.yesterday.toLocaleString(); document.getElementById('saleMonth').innerText = d.month.toLocaleString(); }); }

function openHistoryModal() { 
    document.getElementById('historyModal').classList.remove('hidden'); 
    const list = document.getElementById('historyList');
    list.innerHTML = '<tr><td colspan="3" class="text-center p-10 text-gray-400"><i class="fas fa-circle-notch fa-spin text-2xl mb-2"></i><br>กำลังโหลดรายการ...</td></tr>'; 
    fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: "getHistory" }) })
    .then(r => r.json())
    .then(d => { 
        if(d.result === 'success') { 
            historyBills = d.data; 
            if(historyBills.length === 0) { list.innerHTML = '<tr><td colspan="3" class="text-center p-10 text-gray-300">ไม่พบประวัติการขาย</td></tr>'; return; }
            list.innerHTML = historyBills.map((b, index) => {
                let dateStr = "-"; let timeStr = "-";
                try { const d = new Date(b.date); dateStr = d.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit' }); timeStr = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }); } catch(e) {}
                return `<tr onclick="openBillDetail(${index})" class="hover:bg-orange-50 transition duration-150 cursor-pointer group border-b border-gray-100 last:border-0"><td class="p-3 font-mono align-top pt-3 group-hover:text-orange-600"><div class="text-[10px] text-gray-400 font-bold leading-none mb-1">${dateStr}</div><div class="text-sm font-bold text-gray-700">${timeStr}</div></td><td class="p-3 text-gray-700 align-top pt-3"><span class="line-clamp-1 leading-relaxed font-medium group-hover:text-orange-800">${b.itemSummary}</span><span class="text-[10px] text-gray-400 block mt-0.5 group-hover:text-orange-400">ID: ${b.billId}</span></td><td class="p-3 text-right font-bold text-gray-800 align-top pt-3 whitespace-nowrap text-base group-hover:text-orange-600">${parseFloat(b.total).toLocaleString()}</td></tr>`; 
            }).join(''); 
        } else { list.innerHTML = `<tr><td colspan="3" class="text-center p-4 text-red-400">Error: ${d.error}</td></tr>`; }
    })
    .catch(err => { list.innerHTML = '<tr><td colspan="3" class="text-center p-4 text-red-400">เชื่อมต่อไม่ได้</td></tr>'; }); 
}

function openBillDetail(index) {
    const bill = historyBills[index]; if (!bill) return;
    const d = new Date(bill.date); const dateStr = d.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit' }); const timeStr = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    const tableNo = bill.table || 'N/A'; const customerMatch = tableNo.match(/(.*)\s*\((.*?)\)\s*(\[ส่งที่:\s*.*\])?/); const customerName = customerMatch ? customerMatch[1].trim() : tableNo; const customerPhone = customerMatch && customerMatch[2] ? customerMatch[2].trim() : ''; const customerAddress = customerMatch && customerMatch[3] ? customerMatch[3] : '';
    const content = document.getElementById('billDetailContent');
    const itemsHtml = bill.items.map(item => `<div class="flex justify-between items-start text-sm border-b border-dashed border-gray-200 py-2"><div class="flex-1 pr-2"><div class="font-medium text-gray-800">${item.name}</div><div class="text-xs text-gray-500">${item.price.toLocaleString()} x ${item.qty}</div></div><div class="w-16 text-right font-bold text-gray-800">${(item.price * item.qty).toLocaleString()}</div></div>`).join('');
    content.innerHTML = `
        <div class="p-4 pt-6 bg-white border-b border-gray-200 flex-shrink-0"><div class="text-center pb-3 border-b border-dashed border-gray-300"><h3 class="text-2xl font-extrabold text-gray-800 mb-1">ใบเสร็จรับเงิน</h3><p class="text-xs text-gray-500 mb-2">บิล ID: ${bill.billId}</p></div>
        <div class="pt-4 pb-2 text-xs space-y-1"><div class="flex justify-between"><span class="text-gray-500">วัน/เวลา:</span><span class="font-bold text-gray-700">${dateStr} ${timeStr}</span></div><div class="font-bold text-gray-700 pt-2 border-t border-dashed"><i class="fas fa-user-tag mr-2 text-orange-500"></i> ลูกค้า: ${customerName} ${customerPhone ? `(${customerPhone})` : ''}</div>${customerAddress ? `<div class="text-gray-500 text-xs"><i class="fas fa-map-marker-alt text-red-500 mr-1"></i> ที่อยู่: ${customerAddress.replace(/\[ส่งที่:\s*|\]/g, '').trim()}</div>` : ''}${bill.note ? `<div class="text-gray-500 pt-2 border-t border-dashed">หมายเหตุ: ${bill.note}</div>` : ''}</div></div>
        <div class="flex-1 overflow-y-auto custom-scrollbar bg-white px-4 border-b border-gray-200"> <div class="pt-2 pb-2 space-y-1">${itemsHtml}</div></div>
        <div class="p-4 flex-shrink-0 border-t border-gray-200 bg-white"><div class="pb-3 space-y-2 border-b border-gray-300"><div class="flex justify-between font-bold text-lg"><span class="text-gray-700">รวมทั้งสิ้น</span><span class="text-2xl font-extrabold text-orange-600">${bill.total.toLocaleString()} ฿</span></div><div class="flex justify-between text-sm"><span class="text-gray-500">รับเงิน</span><span class="font-bold text-gray-700">${parseFloat(bill.receive || bill.total).toLocaleString()} ฿</span></div><div class="flex justify-between text-sm"><span class="text-gray-500">เงินทอน</span><span class="font-bold text-green-600">${parseFloat(bill.change || 0).toLocaleString()} ฿</span></div></div>
        <div class="mt-4 flex gap-2 items-center"><button onclick="printReceiptFromIndex(${index})" class="bg-orange-500 hover:bg-orange-600 text-white w-1/4 py-2 rounded-xl text-sm font-bold transition shadow-md"><i class="fas fa-print"></i> พิมพ์</button><button onclick="confirmDeleteBill('${bill.billId}')" class="bg-red-600 hover:bg-red-700 text-white w-1/4 py-2 rounded-xl text-sm font-bold transition shadow-md"><i class="fas fa-trash-alt"></i> ลบ</button><button onclick="closeModal('billDetailModal')" class="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 py-2 rounded-xl font-bold transition">ปิดหน้าต่าง</button></div></div>
    `;
    document.getElementById('billDetailModal').classList.remove('hidden');
}

function confirmDeleteBill(billId) { document.getElementById('deleteBillIdTarget').value = billId; document.getElementById('deleteBillModal').classList.remove('hidden'); }
function executeDeleteBill() {
    const billId = document.getElementById('deleteBillIdTarget').value; setLoading('btnConfirmDeleteBill', true, 'กำลังลบ...');
    fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: "deleteBill", billId: billId }) }).then(res => res.json()).then(data => {
        if(data.result === 'success') { showToast('ลบบิลเรียบร้อยแล้ว', 'success'); closeModal('deleteBillModal'); closeModal('billDetailModal'); openHistoryModal(); openSalesModal(); } 
        else { showCustomAlert('ผิดพลาด', 'ไม่สามารถลบบิลได้: ' + data.error, '<i class="fas fa-exclamation-circle text-red-500"></i>'); }
    }).catch(err => showCustomAlert('Connection Error', 'ตรวจสอบอินเทอร์เน็ต')).finally(() => setLoading('btnConfirmDeleteBill', false, 'ยืนยันลบ'));
}

function printReceipt(bill) {
    let items = bill.items; if (typeof items === 'string') { try { items = JSON.parse(items); } catch(e) { items = []; } }
    let itemsHtml = items.map(i => `<tr><td style="text-align: left; padding: 2px 0;">${i.name}<br><span style="font-size: 10px; color: #666;">x${i.qty}</span></td><td style="text-align: right; vertical-align: top; padding: 2px 0;">${(i.price * i.qty).toLocaleString()}</td></tr>`).join('');
    const printWindow = window.open('', '', 'width=300,height=600');
    const receiptHtml = `<html><head><title>Print Receipt</title><style>body { font-family: 'Courier New', monospace; margin: 0; padding: 10px; width: 58mm; color: #000; font-size: 12px; } .header { text-align: center; margin-bottom: 10px; } .store-name { font-size: 16px; font-weight: bold; margin-bottom: 5px; } .divider { border-top: 1px dashed #000; margin: 5px 0; } table { width: 100%; border-collapse: collapse; } .total-section { margin-top: 10px; font-weight: bold; font-size: 14px; } .footer { text-align: center; margin-top: 15px; font-size: 10px; } @media print { @page { margin: 0; size: 58mm auto; } body { margin: 0; } }</style></head><body><div class="header"><div class="store-name">ร้านเจ้พิน ขายของชำ</div><div>ใบเสร็จรับเงิน</div></div><div class="divider"></div><div style="font-size: 10px;"><div>วันที่: ${new Date(bill.date).toLocaleString('th-TH')}</div><div>Bill ID: ${bill.billId}</div><div>ลูกค้า: ${bill.table} (${bill.type})</div></div><div class="divider"></div><table>${itemsHtml}</table><div class="divider"></div><table><tr class="total-section"><td style="text-align: left;">รวมทั้งสิ้น</td><td style="text-align: right;">${parseFloat(bill.total).toLocaleString()}</td></tr><tr style="font-size: 11px;"><td style="text-align: left;">รับเงิน</td><td style="text-align: right;">${parseFloat(bill.receive || bill.total).toLocaleString()}</td></tr><tr style="font-size: 11px;"><td style="text-align: left;">เงินทอน</td><td style="text-align: right;">${parseFloat(bill.change || 0).toLocaleString()}</td></tr></table><div class="footer">ขอบคุณที่อุดหนุนครับ/ค่ะ<br>Powered by ICE KANJANAWAT POS</div><script>window.onload = function() { window.print(); setTimeout(function() { window.close(); }, 100); }<\/script><\/body><\/html>`;
    printWindow.document.write(receiptHtml); printWindow.document.close();
}
function printReceiptFromIndex(index) { const bill = historyBills[index]; if(bill) { printReceipt(bill); } else { showCustomAlert('Error', 'ไม่พบข้อมูลบิล'); } }

document.getElementById('editMenuForm').addEventListener('submit', function(e) { e.preventDefault(); setLoading('btnEditSave', true, 'กำลังบันทึก...'); const payload = { action: "editMenu", id: document.getElementById('eId').value, name: document.getElementById('eName').value, price: document.getElementById('ePrice').value, category: document.getElementById('eCategory').value, spicy: "-" }; fetch(API_URL, { method: 'POST', body: JSON.stringify(payload) }).then(r=>r.json()).then(d=>{ if(d.result==='success') { showToast('แก้ไขสำเร็จ', 'success'); closeModal('editMenuModal'); fetchMenu(); } }).finally(()=>setLoading('btnEditSave', false, 'บันทึก')); });

function compressImage(file, maxWidth, quality) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.readAsDataURL(file);
        reader.onload = event => { const img = new Image(); img.src = event.target.result; img.onload = () => { const canvas = document.createElement('canvas'); let width = img.width; let height = img.height; if (width > height) { if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; } } else { if (height > maxWidth) { width *= maxWidth / height; height = maxWidth; } } canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, width, height); resolve(canvas.toDataURL('image/jpeg', quality)); }; img.onerror = error => reject(error); }; reader.onerror = error => reject(error);
    });
}

document.getElementById('addMenuForm').addEventListener('submit', function(e) { 
    e.preventDefault(); 
    const fileInput = document.getElementById('mFile'); const file = fileInput.files[0]; const mCode = document.getElementById('mCode').value.trim();
    if (file) {
         setLoading('btnSaveMenu', true, 'กำลังบีบอัดรูป...'); 
         compressImage(file, 800, 0.7).then(compressedBase64 => {
            setLoading('btnSaveMenu', true, 'กำลังอัปโหลด...'); 
            const base64Data = compressedBase64.split(',')[1];
            const payload = { action: "addMenu", name: document.getElementById('mName').value, price: document.getElementById('mPrice').value, category: document.getElementById('mCategory').value, spicy: "-", image: base64Data, mimeType: "image/jpeg", fileName: file.name.replace(/\.[^/.]+$/, "") + ".jpg" };
            if (mCode) { payload.id = mCode; } sendAddMenu(payload);
        } ).catch(err => { console.error(err); setLoading('btnSaveMenu', false, 'บันทึก'); showCustomAlert('Error', 'ไม่สามารถประมวลผลรูปภาพได้'); });
    } else {
         // 🔴 เอา setLoading ออก 
         const payload = { action: "addMenu", name: document.getElementById('mName').value, price: document.getElementById('mPrice').value, category: document.getElementById('mCategory').value, spicy: "-", image: "", mimeType: "", fileName: "" };
         if (mCode) { payload.id = mCode; } sendAddMenu(payload);
    }
});

function uploadBankQRFile(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0]; const reader = new FileReader(); const imgEl = document.getElementById('bankQRImage'); const originalSrc = imgEl.src; imgEl.style.opacity = '0.5';
        reader.onload = function(e) {
              const base64Preview = e.target.result; imgEl.src = base64Preview;
              compressImage(file, 600, 0.7).then(compressedBase64 => {
                  const base64Data = compressedBase64.split(',')[1];
                  const payload = { action: "uploadBankQR", image: base64Data, mimeType: "image/jpeg", folderId: QR_FOLDER_ID };
                  fetch(API_URL, { method: 'POST', body: JSON.stringify(payload) }).then(r => r.json()).then(d => {
                      if(d.result === 'success') { localStorage.setItem('bankQRID', d.fileId); localStorage.removeItem('promptPayID'); showToast('อัปโหลด QR Code สำเร็จ', 'success'); initBankQR(); closeModal('manageQRModal'); } else { throw new Error(d.error); }
                  }).catch(err => { imgEl.src = originalSrc; showCustomAlert('Error', 'อัปโหลดไม่สำเร็จ: ' + err); }).finally(() => { imgEl.style.opacity = '1'; });
              });
        }; reader.readAsDataURL(file);
    }
}

function sendAddMenu(payload) {
     // =========================================
     // 🚀 1. อัปเดตหน้าจอทันที (Optimistic Update)
     // =========================================
     
     // รีเซ็ตปุ่มเผื่อมีสถานะค้าง
     setLoading('btnSaveMenu', false, 'บันทึก'); 

     const tempId = payload.id || ("P" + Date.now()); 
     const newItem = { 
         id: tempId, 
         name: payload.name, 
         price: parseFloat(payload.price), 
         category: payload.category || 'ทั่วไป', 
         image: '', 
         spicy: '-' 
     };
     
     // 1.1 โยนเข้าตะกร้าขายทันที!
     addItemToCart(newItem, "-"); 
     
     // 1.2 เคลียร์ช่องค้นหา และ ปิดหน้าต่างทันที!
     document.getElementById('searchInput').value = '';
     closeModal('addModal'); 
     
     // 1.3 ยัดเข้าฐานข้อมูลในเครื่องเพื่อให้ยิงบาร์โค้ดชิ้นเดิมซ้ำได้ทันที
     menuData.push(newItem);
     masterData.push(newItem);
     
     // 1.4 อัปเดตตารางสินค้า
     const activeCategoryBtn = document.querySelector('.cat-btn.bg-gradient-to-r');
     const currentCat = activeCategoryBtn ? activeCategoryBtn.innerText : 'All';
     filterMenu(currentCat === 'ทั้งหมด' ? 'All' : currentCat);
     
     // 1.5 ล้างฟอร์มรอไว้เผื่อกดเพิ่มสินค้าใหม่
     document.getElementById('addMenuForm').reset(); 

     // =========================================
     // 📡 2. ส่งข้อมูลไปเซิร์ฟเวอร์ (ทำงานอยู่เบื้องหลัง ไม่กระทบการขาย)
     // =========================================
     fetch(API_URL, { method: 'POST', body: JSON.stringify(payload) })
     .then(r => r.json())
     .then(d => { 
         if(d.result !== 'success') { 
             // ถ้ายิงข้อมูลไม่เข้า ค่อยเด้งเตือนทีหลัง
             showCustomAlert('ผิดพลาด', 'บันทึกสินค้าลงฐานข้อมูลไม่สำเร็จ: ' + d.error, '<i class="fas fa-exclamation-circle text-red-500"></i>'); 
         } 
     })
     .catch(err => { 
         console.error('Connection Error:', err); 
     }); 
}

function confirmDeleteMenu() { setLoading('btnDeleteMenu', true, 'ลบ...'); fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: "deleteMenu", id: document.getElementById('eId').value }) }).then(r=>r.json()).then(d=>{ if(d.result === 'success') { showToast('ลบสินค้าแล้ว', 'success'); closeModal('editMenuModal'); fetchMenu(); } else { showCustomAlert('ผิดพลาด', 'ลบสินค้าไม่สำเร็จ: ' + d.error, '<i class="fas fa-exclamation-circle text-red-500"></i>'); } }).catch(err => showCustomAlert('Connection Error', 'ตรวจสอบอินเทอร์เน็ตของคุณ')).finally(()=>setLoading('btnDeleteMenu', false, 'ลบ')); }
function deleteMenu() { openConfirmActionModal('ยืนยันการลบสินค้า', 'คุณแน่ใจหรือไม่ที่จะลบสินค้านี้? การกระทำนี้ไม่สามารถย้อนกลับได้', '<i class="fas fa-trash-alt"></i>', confirmDeleteMenu); }
function openConfirmActionModal(title, msg, iconHtml, confirmHandler) { document.getElementById('confirmActionTitle').innerText = title; document.getElementById('confirmActionMsg').innerText = msg; document.getElementById('confirmActionIcon').innerHTML = iconHtml; const confirmBtn = document.getElementById('btnConfirmAction'); confirmBtn.onclick = () => { closeModal('confirmActionModal'); confirmHandler(); }; document.getElementById('confirmActionModal').classList.remove('hidden'); }

function closeModal(id) { 
    document.getElementById(id).classList.add('hidden'); 
    if (id === 'paymentModal') { const leftPanel = document.getElementById('leftPanel'); if(leftPanel) leftPanel.classList.remove('blur-sm', 'opacity-50', 'pointer-events-none'); }
}

function showToast(msg, type='success') { const toast = document.getElementById('toast'); const iconContainer = toast.querySelector('div:first-child'); const icon = iconContainer.querySelector('i'); if (type === 'warning') { toast.classList.remove('border-green-500'); toast.classList.add('border-yellow-500'); iconContainer.classList.replace('bg-green-100', 'bg-yellow-100'); icon.classList.replace('text-green-600', 'text-yellow-600'); icon.className = 'fas fa-bell'; } else { toast.classList.add('border-green-500'); toast.classList.remove('border-yellow-500'); iconContainer.classList.replace('bg-yellow-100', 'bg-green-100'); icon.classList.replace('text-yellow-600', 'text-green-600'); icon.className = 'fas fa-check'; } document.getElementById('toastMsg').innerText = msg; toast.style.transform = 'translateX(0)'; setTimeout(() => { toast.style.transform = 'translateX(150%)'; }, 3000); }
function showCustomAlert(title, msg, icon='<i class="fas fa-info-circle text-orange-500"></i>') { document.getElementById('alertTitle').innerText = title; document.getElementById('alertMsg').innerText = msg; document.getElementById('alertIcon').innerHTML = icon; document.getElementById('customAlert').classList.remove('hidden'); }
function closeCustomAlert() { document.getElementById('customAlert').classList.add('hidden'); }
function setLoading(btnId, isLoading, text) { const btn = document.getElementById(btnId); let span = btn.querySelector('.btn-text'); let icon = btn.querySelector('i.fas'); if (!span && btnId === 'btnDeleteMenu') { if (btn.innerHTML.indexOf('<span class="btn-text">') === -1) { const originalText = btn.innerText; btn.innerHTML = `<span class="btn-text">${originalText}</span> <i class="fas fa-trash-alt"></i>`; } span = btn.querySelector('.btn-text'); icon = btn.querySelector('i.fas'); } else if (!span && btnId !== 'btnDeleteMenu') { if (btn.innerHTML.indexOf('<span class="btn-text">') === -1) { const originalText = btn.innerText; btn.innerHTML = `<span class="btn-text">${originalText}</span> <i class="fas fa-save"></i>`; } span = btn.querySelector('.btn-text'); icon = btn.querySelector('i.fas'); } if(isLoading) { btn.disabled = true; btn.classList.add('opacity-75', 'cursor-not-allowed'); if(span && !span.dataset.originalText) { span.dataset.originalText = span.innerText; } if(span) span.innerText = text; if(icon && !icon.dataset.originalClass) { icon.dataset.originalClass = icon.dataset.originalClass; } if(icon) { icon.className = "fas fa-circle-notch fa-spin"; } } else { btn.disabled = false; btn.classList.remove('opacity-75', 'cursor-not-allowed'); if(span && span.dataset.originalText) { span.innerText = span.dataset.originalText; delete span.dataset.originalText; span.removeAttribute('data-original-text'); } if(icon && icon.dataset.originalClass) { icon.className = icon.dataset.originalClass; delete icon.dataset.originalClass; icon.removeAttribute('data-original-class'); } } }

function initStoreStatus() {
    fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: "getStoreStatus" }) }).then(r => r.json()).then(d => {
        if (d.result === 'success') { isStoreOpen = d.isOpen; updateStoreUI(); if (isCustomerMode && !isStoreOpen) { document.getElementById('storeClosedModal').classList.remove('hidden'); } }
    });
}

function toggleStoreStatus() {
    if (isCustomerMode) return; 
    const newStatus = !isStoreOpen; isStoreOpen = newStatus; updateStoreUI();
    fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: "setStoreStatus", isOpen: newStatus }) }).then(r => r.json()).then(d => {
        if (d.result !== 'success') { isStoreOpen = !newStatus; updateStoreUI(); showToast('เปลี่ยนสถานะไม่สำเร็จ', 'warning'); } else { showToast(isStoreOpen ? 'เปิดรับออเดอร์แล้ว' : 'ปิดรับออเดอร์แล้ว', 'success'); }
    });
}

function updateStoreUI() {
    const bg = document.getElementById('storeToggleBg'); const dot = document.getElementById('storeToggleDot'); const text = document.getElementById('storeStatusText');
    if (isStoreOpen) { bg.className = "w-10 h-5 rounded-full relative transition-colors duration-300 shadow-inner flex items-center bg-green-500"; dot.style.transform = "translateX(20px)"; text.innerText = "เปิด"; } else { bg.className = "w-10 h-5 rounded-full relative transition-colors duration-300 shadow-inner flex items-center bg-red-500"; dot.style.transform = "translateX(0px)"; text.innerText = "ปิด"; }
}

function openMyRecentOrder() {
    const modal = document.getElementById('myOrderModal'); const content = document.getElementById('myOrderContent');
    if (myLastOrders && myLastOrders.items && myLastOrders.items.length > 0) { 
        const total = myLastOrders.total; const orderNote = myLastOrders.note || ''; 
        let addressString = "ไม่ระบุ"; let remainingNote = orderNote; const addressMatch = orderNote.match(/\[ส่งที่:\s*(.*?)\]/); 
        if (addressMatch && addressMatch[1]) { addressString = addressMatch[1]; remainingNote = orderNote.replace(addressMatch[0], '').trim(); }
        const cName = localStorage.getItem('customerName') || 'ลูกค้า'; const cPhone = localStorage.getItem('customerPhone') || '-';

        let html = `<div class="text-center mb-6"><h3 class="text-xl font-extrabold text-orange-600 mb-1">ใบเสร็จรับเงิน (ออเดอร์ล่าสุด)</h3><p class="text-xs text-gray-500">ขอบคุณที่ใช้บริการค่ะ</p></div><div class="bg-gray-50 p-4 rounded-xl mb-4 border border-gray-200 shadow-inner"><div class="font-bold text-sm text-gray-700 mb-2 border-b pb-2 border-dashed"><i class="fas fa-user-tag mr-2 text-orange-500"></i> ผู้สั่ง: ${cName} <span class="text-xs text-gray-500">(${cPhone})</span></div><div class="text-sm text-gray-600"><i class="fas fa-map-marker-alt mr-2 text-red-500"></i>ที่อยู่จัดส่ง: <span class="font-bold">${addressString}</span></div>${remainingNote ? `<div class="text-xs text-gray-500 mt-2 pt-2 border-t border-dashed">หมายเหตุ: ${remainingNote}</div>` : ''}<div class="text-xs text-gray-500 mt-2 pt-2 border-t">เวลาสั่ง: ${new Date(myLastOrders.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</div></div><div class="space-y-3">`;

        myLastOrders.items.forEach(item => { const itemTotal = item.price * item.qty; html += `<div class="flex justify-between items-center bg-white p-3 rounded-xl border border-gray-200 shadow-sm"><div><h4 class="font-bold text-gray-700">${item.name}</h4><div class="text-xs text-gray-500">${item.price} x ${item.qty}</div></div><div class="font-bold text-orange-600">${itemTotal.toLocaleString()} ฿</div></div>`; });
        
        html += `</div><div class="mt-4 pt-4 border-t border-dashed border-gray-300 flex justify-between items-center"><span class="text-gray-600 font-bold">รวมทั้งหมด</span><span class="text-2xl font-bold text-orange-600">${total.toLocaleString()} ฿</span></div><div class="mt-6 text-center"><p class="text-green-600 font-bold text-sm mb-2"><i class="fas fa-check-circle"></i> ทางร้านได้รับออเดอร์แล้ว</p><button onclick="closeModal('myOrderModal')" class="bg-gray-800 text-white w-full py-3 rounded-xl font-bold hover:bg-gray-900 transition">ปิดหน้าต่าง</button></div>`;
        content.innerHTML = html;
    } else { content.innerHTML = '<div class="text-center py-10"><i class="fas fa-shopping-basket text-4xl text-gray-300 mb-2"></i><p class="text-gray-400">ยังไม่มีรายการที่สั่งล่าสุด</p></div>'; }
    modal.classList.remove('hidden');
}

function checkLoginStatus() {
    const loginScreen = document.getElementById('loginScreen');
    const urlParams = new URLSearchParams(window.location.search);
    const isCustomer = urlParams.get('mode') === 'customer';
    
    if (isCustomer || (typeof isCustomerMode !== 'undefined' && isCustomerMode)) { loginScreen.classList.add('hidden'); checkCustomerIdentity(); initStoreStatus(); return; }

    const isLoggedIn = localStorage.getItem('isLoggedIn'); 
    if (isLoggedIn === 'true') { loginScreen.classList.add('hidden'); initStoreStatus(); } else { loginScreen.classList.remove('hidden'); }
}

function checkCustomerIdentity() {
    const savedName = localStorage.getItem('customerName'); const savedPhone = localStorage.getItem('customerPhone'); const savedHouseNo = localStorage.getItem('customerAddrHouse'); const savedSoi = localStorage.getItem('customerAddrSoi');
    if (!savedName || !savedPhone || !savedHouseNo || !savedSoi) { 
        document.getElementById('customerIdentityModal').classList.remove('hidden');
        if (savedHouseNo) document.getElementById('custIdHouseNo').value = savedHouseNo;
        if (savedSoi) document.getElementById('custIdSoi').value = savedSoi;
    } else { document.getElementById('customerTableDisplay').innerText = savedName; }
}

document.getElementById('customerIdentityForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const name = document.getElementById('custIdName').value.trim(); const phone = document.getElementById('custIdPhone').value.trim(); const houseNo = document.getElementById('custIdHouseNo').value.trim(); const soi = document.getElementById('custIdSoi').value.trim();
    if(!name || !phone || !houseNo || !soi) { showToast('กรุณากรอกข้อมูลให้ครบถ้วน', 'warning'); return; }
    if(phone.length < 9 || isNaN(phone)) { showToast('เบอร์โทรศัพท์ไม่ถูกต้อง', 'warning'); return; }
    
    localStorage.setItem('customerName', name); localStorage.setItem('customerPhone', phone); localStorage.setItem('customerAddrHouse', houseNo); localStorage.setItem('customerAddrSoi', soi);
    document.getElementById('customerIdentityModal').classList.add('hidden'); document.getElementById('customerTableDisplay').innerText = name; showToast(`ยินดีต้อนรับคุณ ${name}`, 'success'); speak("ยินดีต้อนรับค่ะ");
});

document.getElementById('loginForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const errorBox = document.getElementById('loginErrorBox'); errorBox.classList.add('hidden');
    const phone = document.getElementById('loginPhone').value.trim(); const pass = document.getElementById('loginPass').value.trim();
    setLoading('btnLogin', true, 'กำลังตรวจสอบ...');
    
    fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: "login", phone: phone, password: pass }) })
    .then(res => res.json())
    .then(data => {
        if(data.result === 'success') {
            localStorage.setItem('isLoggedIn', 'true'); localStorage.setItem('userPhone', phone); showToast('เข้าสู่ระบบสำเร็จ', 'success');
            const screen = document.getElementById('loginScreen'); screen.style.opacity = '0';
            setTimeout(() => { screen.classList.add('hidden'); initStoreStatus(); }, 500);
        } else {
            document.getElementById('loginErrorMsg').innerText = data.error || 'รหัสผ่านไม่ถูกต้อง'; errorBox.classList.remove('hidden');
            const card = document.querySelector('#loginScreen > div'); card.classList.add('animate-pulse'); setTimeout(() => card.classList.remove('animate-pulse'), 500);
        }
    })
    .catch(err => { document.getElementById('loginErrorMsg').innerText = 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้'; errorBox.classList.remove('hidden'); })
    .finally(() => { setLoading('btnLogin', false, 'เข้าสู่ระบบ'); });
});

function logout() { document.getElementById('logoutModal').classList.remove('hidden'); }
function confirmLogout() { localStorage.removeItem('isLoggedIn'); localStorage.removeItem('userPhone'); location.reload(); }

function openChangePassModal() {
    const currentPhone = localStorage.getItem('userPhone') || ''; document.getElementById('changePassPhone').value = currentPhone; document.getElementById('newPasswordInput').value = ''; document.getElementById('changePassModal').classList.remove('hidden');
    setTimeout(() => document.getElementById('changePassPhone').focus(), 300);
}

function submitChangePassword() {
    const phoneVal = document.getElementById('changePassPhone').value.trim(); const newPass = document.getElementById('newPasswordInput').value.trim();
    if (!phoneVal) { alert("กรุณาระบุเบอร์โทรศัพท์"); return; } if (!newPass) { alert("กรุณากรอกรหัสผ่านใหม่"); return; }
    setLoading('btnSubmitChangePass', true, 'กำลังบันทึก...');
    fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: "changePassword", phone: phoneVal, newPassword: newPass }) })
    .then(res => res.json()).then(data => { if(data.result === 'success') { showToast('เปลี่ยนรหัสผ่านเรียบร้อย', 'success'); closeModal('changePassModal'); localStorage.setItem('userPhone', phoneVal); } else { alert('เปลี่ยนรหัสไม่สำเร็จ: ' + data.error); } })
    .catch(err => { alert('Error: ' + err); }).finally(() => { setLoading('btnSubmitChangePass', false, 'บันทึกรหัสผ่านใหม่'); });
}

function setupPasswordRestrictions() {
    const passwordFields = ['loginPass', 'newPasswordInput'];
    passwordFields.forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.addEventListener('input', function(e) { const thaiRegex = /[\u0E00-\u0E7F]/g; if (thaiRegex.test(this.value)) { this.value = this.value.replace(thaiRegex, ''); showToast('รหัสผ่านต้องเป็นภาษาอังกฤษ/ตัวเลขเท่านั้น', 'warning'); this.classList.add('border-red-500', 'animate-pulse'); setTimeout(() => { this.classList.remove('border-red-500', 'animate-pulse'); }, 500); } }); }
    });
}

function makeDraggable(draggableElement, dragHandle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    if (dragHandle) { dragHandle.onmousedown = dragMouseDown; dragHandle.ontouchstart = dragMouseDown; } else { draggableElement.onmousedown = dragMouseDown; draggableElement.ontouchstart = dragMouseDown; }
    function dragMouseDown(e) { e = e || window.event; e.preventDefault(); let clientX = e.clientX; let clientY = e.clientY; if (e.touches && e.touches.length) { clientX = e.touches[0].clientX; clientY = e.touches[0].clientY; } pos3 = clientX; pos4 = clientY; document.onmouseup = closeDragElement; document.onmousemove = elementDrag; document.ontouchend = closeDragElement; document.ontouchmove = elementDrag; }
    function elementDrag(e) { e = e || window.event; e.preventDefault(); let clientX = e.clientX; let clientY = e.clientY; if (e.touches && e.touches.length) { clientX = e.touches[0].clientX; clientY = e.touches[0].clientY; } pos1 = pos3 - clientX; pos2 = pos4 - clientY; pos3 = clientX; pos4 = clientY; draggableElement.style.top = (draggableElement.offsetTop - pos2) + "px"; draggableElement.style.left = (draggableElement.offsetLeft - pos1) + "px"; }
    function closeDragElement() { document.onmouseup = null; document.onmousemove = null; document.ontouchend = null; document.ontouchmove = null; }
}

function togglePaymentMenu() { const menu = document.getElementById('paymentSettingsMenu'); if (menu) { if (menu.classList.contains('hidden')) { menu.classList.remove('hidden'); } else { menu.classList.add('hidden'); } } }
function toggleFloatingNumpad() { const pad = document.getElementById('floatingNumpad'); if (pad.classList.contains('hidden')) { pad.classList.remove('hidden'); const header = document.getElementById('numpadHeader'); makeDraggable(pad, header); } else { pad.classList.add('hidden'); } }

function numpadPress(num, btnElement) {
    // ลบคำสั่ง playNotificationSound(); ออกไปแล้ว จะไม่มีเสียงติ๊ดๆ กวนใจ

    // --- ส่วนเพิ่มเอฟเฟคขยายปุ่ม (Animation) ---
    if (btnElement) {
        btnElement.classList.remove('active:scale-95'); 
        btnElement.classList.add('btn-pop');
        
        setTimeout(() => {
            btnElement.classList.remove('btn-pop');
            btnElement.classList.add('active:scale-95');
        }, 150);
    }
    
    const paymentModal = document.getElementById('paymentModal');
    const isPaymentOpen = !paymentModal.classList.contains('hidden');

    let targetInput;

    if (isPaymentOpen) {
        targetInput = document.getElementById('inputReceived');
    } else {
        targetInput = document.getElementById('searchInput');
        targetInput.focus(); 
    }

    if (targetInput) {
        targetInput.value += num;
        targetInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
}

function numpadAction(action) {
    const paymentModal = document.getElementById('paymentModal'); const isPaymentOpen = !paymentModal.classList.contains('hidden');
    let targetInput = isPaymentOpen ? document.getElementById('inputReceived') : document.getElementById('searchInput');
    if (action === 'del') { targetInput.value = targetInput.value.slice(0, -1); targetInput.dispatchEvent(new Event('input', { bubbles: true })); targetInput.focus(); } 
    else if (action === 'enter') { if (isPaymentOpen) { confirmPayment(); } else { processSearchEnter(); } }
}

function toggleSystemKeyboard() {
    const input = document.getElementById('searchInput'); const btn = document.getElementById('btnToggleKey');
    if (input.getAttribute('inputmode') === 'none') {
        input.setAttribute('inputmode', 'text'); btn.classList.add('bg-orange-500', 'text-white', 'border-orange-500'); btn.classList.remove('bg-white', 'text-gray-400', 'border-gray-200'); input.placeholder = "พิมพ์ชื่อสินค้า..."; input.focus();
    } else {
        input.setAttribute('inputmode', 'none'); btn.classList.remove('bg-orange-500', 'text-white', 'border-orange-500'); btn.classList.add('bg-white', 'text-gray-400', 'border-gray-200'); input.placeholder = "ยิงบาร์โค้ด..."; input.blur(); 
    }
}

let isEmbeddedNumpadOpen = false;
function toggleEmbeddedNumpad() {
    const panel = document.getElementById('embeddedNumpadPanel'); 
    const keys = document.getElementById('embeddedKeys'); 
    const miniBar = document.getElementById('minimizedBar');
    
    isEmbeddedNumpadOpen = !isEmbeddedNumpadOpen;
    
    if (isEmbeddedNumpadOpen) { 
        keys.classList.remove('hidden'); 
        miniBar.classList.add('hidden'); 
    } else { 
        keys.classList.add('hidden'); 
        miniBar.classList.remove('hidden'); 
    }
}

function openExportModal() {
    const today = new Date().toISOString().split('T')[0]; document.getElementById('exportStartDate').value = today; document.getElementById('exportEndDate').value = today; document.getElementById('exportModal').classList.remove('hidden');
}

function executeExportPDF() {
    const type = document.getElementById('exportType').value; const start = document.getElementById('exportStartDate').value; const end = document.getElementById('exportEndDate').value;
    if (!start || !end) { showToast('กรุณาเลือกวันที่ให้ครบ', 'warning'); return; }
    setLoading('btnDoExport', true, 'กำลังสร้าง PDF...');
    fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: "exportPDF", reportType: type, startDate: start, endDate: end }) }).then(res => res.json()).then(data => {
        if (data.result === 'success') {
            const link = document.createElement('a'); link.href = "data:application/pdf;base64," + data.base64; link.download = `Report_${type}_${start}_${end}.pdf`; document.body.appendChild(link); link.click(); document.body.removeChild(link);
            showToast('ดาวน์โหลดเรียบร้อย', 'success'); closeModal('exportModal');
        } else { showCustomAlert('ผิดพลาด', 'สร้าง PDF ไม่สำเร็จ: ' + data.error); }
    }).catch(err => { console.error(err); showCustomAlert('Connection Error', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้'); }).finally(() => { setLoading('btnDoExport', false, 'ดาวน์โหลด PDF'); });
}

function syncSearch(val) {
    const mainInput = document.getElementById('searchInput'); mainInput.value = val; searchMenu();
    const btnClear = document.getElementById('btnClearFloat'); if(val) { btnClear.classList.remove('hidden'); } else { btnClear.classList.add('hidden'); }
}

function clearFloatingSearch() { const floatInput = document.getElementById('floatingSearchInput'); floatInput.value = ''; syncSearch(''); floatInput.focus(); }

document.addEventListener('click', function(event) {
    const menu = document.getElementById('paymentSettingsMenu'); const btn = document.querySelector('button[onclick="togglePaymentMenu()"]');
    if (menu && !menu.classList.contains('hidden')) { if (!menu.contains(event.target) && !btn.contains(event.target)) { menu.classList.add('hidden'); } }
});

// ==========================================
// 🚀 INITIALIZATION (โหลดคำสั่งทั้งหมดตอนเปิดเว็บ)
// ==========================================
window.onload = () => {
    // 1. ตรวจสอบโหมดและสถานะ
    checkMode();                 
    checkLoginStatus();          
    initStoreStatus();           
    
    // 2. โหลดข้อมูลและหน้าตาเว็บ
    initDateTime();              
    fetchMenu();                 
    renderCategoryBar();         
    populateCategorySelects();   
    
    // 3. ระบบเบื้องหลังและปุ่มลัด
    startOrderPolling();         
    initGlobalShortcuts();       
    initQuickAddShortcuts();     
    setupPasswordRestrictions(); 
    
    // 4. เปิดระบบให้ลากหน้าต่างรับเงินได้
    const modal = document.getElementById("draggableModal");
    const header = document.getElementById("modalHeader");
    if (modal && header) {
        makeDraggable(modal, header);
    }

    // 🔴 5. บังคับให้ Cursor ไปรอที่ช่องสแกนบาร์โค้ดทันที 🔴
    setTimeout(() => {
        const searchInput = document.getElementById('searchInput');
        // เช็คก่อนว่าไม่ใช่โหมดลูกค้า ถึงจะดึง focus มา
        if (searchInput && typeof isCustomerMode !== 'undefined' && !isCustomerMode) {
            searchInput.focus();
        }
    }, 500); // หน่วงเวลาครึ่งวินาทีให้หน้าเว็บโหลดเสร็จก่อน
};
