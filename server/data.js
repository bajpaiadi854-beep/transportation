const stops = [
  { id:'railway', name:'Raipur Railway Station', lat:21.2522, lng:81.6296, zone:'Central' },
  { id:'jaistambh', name:'Jai Stambh Chowk', lat:21.2446, lng:81.6340, zone:'Central' },
  { id:'collectorate', name:'Collectorate', lat:21.2389, lng:81.6456, zone:'Civil Lines' },
  { id:'telibandha', name:'Telibandha Talab', lat:21.2326, lng:81.6585, zone:'Telibandha' },
  { id:'pandri', name:'Pandri Bus Stand', lat:21.2564, lng:81.6463, zone:'Pandri' },
  { id:'naya', name:'Naya Raipur', lat:21.1610, lng:81.7860, zone:'Atal Nagar' }
];
const routes = [
  { id:'B1', name:'City Link', color:'#2563eb', mode:'Bus', fare:18, stops:['railway','jaistambh','collectorate','telibandha'], minutes:8 },
  { id:'B2', name:'Airport Express', color:'#0f766e', mode:'Bus', fare:28, stops:['pandri','railway','jaistambh','telibandha','naya'], minutes:11 },
  { id:'A1', name:'Green Auto', color:'#c2410c', mode:'Auto', fare:12, stops:['pandri','collectorate','telibandha'], minutes:6 }
];
const vehicles = [ {id:'CG 04 B 2145', routeId:'B1', progress:1.3}, {id:'CG 04 B 9880', routeId:'B2', progress:2.1}, {id:'CG 04 A 6512', routeId:'A1', progress:.6} ];
module.exports = { stops, routes, vehicles };
