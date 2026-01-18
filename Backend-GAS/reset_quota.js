function resetFetchQuota() { 
  const service = PropertiesService.getScriptProperties();
  service.deleteProperty('FETCH_STATE');
  console.log('Successfully reset Fetch Quota flag.');
}
