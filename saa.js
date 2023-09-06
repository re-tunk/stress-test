import http  from 'k6/http';
import { sleep } from 'k6';
import  { FormData }  from './formdata.js';

export let options = {
  stages: [
    { duration: '60m', target: 1 }, 
  ],
  insecureSkipTLSVerify: true, // Disable certificate validation
};
  const filePath = './test-file'; // Replace with the path to your file

  const clientCred = {
    grant_type: 'client_credentials',
    client_id: '',
    client_secret: '',
  }

  const fileData = open(filePath, 'b');
  const fileName = 'test-file';
  const mimeType = 'text/plain';
  const workAreaId = 1000;
  const timeToCreateNewWALInSec = 60*3
  const timeToStartWALInSec = 10;
  const templateId = "kemmler";

  const host = "http://localhost:50068";
  const endpointFindWalByState = "/workAreaLayouts/search/findByWorkAreaAndState";
  const endpointStartPhotoAction = "/workAreaLayouts/{workAreaLayoutId}/actions/photoDocumentationAction/{actionId}";
  const endpointFinishWAL = "/workAreaLayouts/{workAreaLayoutId}/actions/finishAction/{actionId}";

export function getToken() {
  // Obtain the access token before the test starts
  let tokenResponse = http.post("https://localhost:50111/auth/realms/ckk-v1/protocol/openid-connect/token", clientCred);
  let accessToken = JSON.parse(tokenResponse.body).access_token;
  // Store the access token in the session to be used in subsequent requests
  return  accessToken;
}

export default function () {
   for (let i = 0; i <= 10; i++) {
    const WorkAreaLayoutName = "TEST WAL ";
    console.log("Creating " + WorkAreaLayoutName + i.toString());
    const response = http.post(host+"/workAreaLayouts",JSON.stringify({
      title: WorkAreaLayoutName + i.toString(),
      workAreaId: workAreaId.toString()}), {
        headers: {'Content-Type': 'application/json','Authorization': `Bearer ${getToken()}`},
      });
    
    if (response.status === 201) {
      console.log(`Workarea layout "${response.body}" created.`);
      const walR = JSON.parse(response.body);
      createWalFile(walR.id, "File "+ i.toString())
    } else {
      console.error(`Failed to create workarea layout "${i}". Status code: ${response.status} and message ${response.error} or ${response.body}`);
    }

    const currentTime = new Date();
    const futureTime = new Date(currentTime.getTime() + (timeToCreateNewWALInSec * 1000));
    const formattedTime = futureTime.toLocaleTimeString();
    console.log("Next WAL creation at " + formattedTime);
    sleep(timeToCreateNewWALInSec); 
  }
}

export function createWalFile(walId, title) {
  const fRes = http.post(`${host}/workAreaLayouts/${walId}/files`,JSON.stringify({
    title: title,
    additionalData: {
      convertionData: {
        templateId: templateId
      }
    }
  }),{
    headers: {'Content-Type': 'application/json','Authorization': `Bearer ${getToken()}`},
  });
  if (fRes.status === 201) {
    console.log(`Workarea layout file "${fRes.body}" created.`);
    uploadFileData(walId,JSON.parse(fRes.body).id)
  } else {
    console.error(`Failed to create workarea layout file. Status code: ${fRes.status} and message ${fRes.error} or ${fRes.body}`);
  }
}

export function uploadFileData(walId,fileId) {
  const fd = new FormData();
  fd.append('content',{data: new Uint8Array(fd.__toByteArray(fileData)), filename: fileName, content_type: mimeType})
   const fRes = http.post(`${host}/workAreaLayouts/${walId}/files/${fileId}/content`, fd.body(),{
    headers: {
      'Authorization': `Bearer ${getToken()}`,
      'Content-Type': 'multipart/form-data; boundary=' + fd.boundary,
    }
   });
  
  if (fRes.status < 299) {
    console.log(`File uploaded for file id ${fileId}.`);
    sleep(timeToStartWALInSec)
    startWal(walId);
  } else {
    console.error(`Failed to upload file. Status code: ${fRes.status} and message ${fRes.error} or ${fRes.body}`);
  }
}

function startWal(walId) {
   const fRes = http.put(`${host}/workAreaLayouts/${walId}/actions/startAction/123456`,JSON.stringify({
    workAreaId: workAreaId.toString(),
   }),{
    headers: {
      'Authorization': `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
    }
   });
  
  console.log("Start workarea layout res" + fRes);
  if (fRes.status < 299) {
    console.log(`Started workarea layout id${walId}.`);
    startSAATest()
  } else {
    console.error(`Failed to start. Status code: ${fRes.status} and message ${fRes.error} or ${fRes.body}`);
  }
}

function startSAATest() {
  // STEP 1: Fetch workarea layout with state running
  const state = "running";
  const res = fetchWalByState(state,workAreaId);
  if (res.status < 299) {
    const response = JSON.parse(res.body);
    console.log("Received total of "+ response.paging.totalSize + " workarea layouts with state " + state);
    if (response.workAreaLayouts.length === 1) {
      // STEP 2: Start photo doc for running workarea layout
      const walId = response.workAreaLayouts[0].id;
      console.log("starting photo doc for workarea layout for " + walId);
      const resStartPhotoDoc = startPhotoDoc(walId);
      if (resStartPhotoDoc.status < 299) {
        console.log("Polling for photo doc action res.")
        const startGetResultStatus = Date.now();
        for (let index = 0; index < 50; index++) {
          console.log("Attempt " + index);
          const resGetPhotoDoc = getPhotoDocResult(walId)
          if (resStartPhotoDoc.status < 299) {
            const res = JSON.parse(resGetPhotoDoc.body);
            console.log("Get Photo Doc state " + res.state);
            if (res.state === "DONE") {
              const endGetResultStatus = Date.now();
              console.info("[getPhotoDocResult] Took " + (endGetResultStatus - startGetResultStatus)/1000 + " secs to execute the function.")
              const resDownload = download(res.images[0].link);
              if (resDownload.status < 299) {
                console.log("resDownload data length", resDownload.body.length);
                finishRunningWal();
                break
              }else{
                // download
                console.log("Error resDownload"+ resDownload.error);
                console.log("====END=====");
              }
            }
          }else{
            // getPhotoDocResult
            const endGetResultStatus = Date.now();
            console.info("[getPhotoDocResult] Took " + (endGetResultStatus - startGetResultStatus)/1000 + " secs to execute the function.")
            console.log("Error resGetPhotoDoc"+ resGetPhotoDoc.error);
            console.log("====END=====");
            break
          }
          sleep(5) // Time in sec for next poll.
        }
      } else {
        // startPhotoDoc
        console.log("Error resStartPhotoDoc"+ resStartPhotoDoc.error);
        console.log("====END=====");
      }
    } else {
      console.log("Total number of workarea layouts with state  " + state + " are "+ response.workAreaLayouts.length);
      console.log("====END=====");
      return
    }
  } else {
    // fetchWalByState
    console.log("Error fetchWalByState"+ res.error);
    console.log("====END=====");
  }
}

function fetchWalByState(state, workAreaId){
  const start = Date.now()
  const url = host+endpointFindWalByState+`?state=${state}&workArea=${workAreaId}`
  console.log("Fetching workarea layouts with state "+ state);
  const res = http.get(url,{
        headers: {'Content-Type': 'application/json','Authorization': `Bearer ${getToken()}`},
      })
  console.log("HTTP Status "+ res.status);
  const end = Date.now();
  console.info("[fetchWalByState] Took " + (end - start)/1000 + " secs to execute the function.")
  return res;
}

function startPhotoDoc(walId) {
  const start = Date.now();
  let url = host+endpointStartPhotoAction;
  url = url.replace("{workAreaLayoutId}",walId).replace("{actionId}","654321");
  console.info("[startPhotoDoc] URL " + url)
  const res = http.put(url,JSON.stringify(
    {
      "async": true,
      "types": [
        "UNDISTORTED"
      ]
    }
  ),{
    headers: {'Authorization': `Bearer ${getToken()}`},
  });
  console.log("HTTP Status "+ res.status);
  const end = Date.now();
  console.info("[startPhotoDoc] Took " + (end - start)/1000 + " secs to execute the function.")
  return res;
}

function getPhotoDocResult(walId) {
  let url = host+endpointStartPhotoAction;
  url = url.replace("{workAreaLayoutId}",walId).replace("{actionId}","654321");
  const res = http.get(url,{
    headers: {'Content-Type': 'application/json','Authorization': `Bearer ${getToken()}`},
  });
  console.log("HTTP Status "+ res.status);
  return res;
}

function download(url){
  const start = Date.now();
  const URL = host+"/"+url;
  console.log("DOWNLOAD URL", URL);
  const res = http.get(URL,{
    headers: {'Content-Type': 'application/octet-stream','Authorization': `Bearer ${getToken()}`},
  });
  console.log("HTTP Status "+ res.status);
  const end = Date.now();
  console.info("[download] Took " + (end - start)/1000 + " secs to execute the function.")
  return res;
}

function finishRunningWal(){
  console.log("Running finishRunningWal fn");
  const state = "running";
  const resFetchWalByState = fetchWalByState(state,workAreaId);
  if (resFetchWalByState.status < 299) {
    const res = JSON.parse(resFetchWalByState.body);
    console.log("Received total of "+ res.paging.totalSize + " workarea layouts with state " + state);
    if (res.workAreaLayouts.length === 1) {
      // STEP 2: Start photo doc for running workarea layout
      const walId = res.workAreaLayouts[0].id;
      console.log("Finishing workarea layout " + walId);
      finishWal(walId)
    } else {
      console.log("Received total of "+ res.paging.totalSize + " workarea layouts with state " + state);
      console.log("====END=====");
    }
  } else {
    // fetchWalByState
    console.log("Error resFetchWalByState"+ resFetchWalByState.error);
    console.log("====END=====");
  }
}

function finishWal(walId){
  console.log("Running finishWal fn");
  let url = host+endpointFinishWAL;
  url = url.replace("{workAreaLayoutId}",walId).replace("{actionId}","654321")
  const start = Date.now();
  const res = http.put(url,JSON.stringify({}),{
    headers: {'Content-Type': 'application/json','Authorization': `Bearer ${getToken()}`},
  });
  console.log("HTTP Status "+ res.status);
  const end = Date.now();
  console.info("[finishWal] Took " + (end - start)/1000 + " secs to execute the function.")
  return res;
}