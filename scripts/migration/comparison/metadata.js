// Libraries
const Axios = require('axios');
const AxiosCookieJarSupport = require('axios-cookiejar-support').default;
const CSVParser = require('@fast-csv/parse');
const CSVWriter = require('csv-writer');
const Errors = require('@ranedrop/errors');
const Filesystem = require('file-system');
const HTMLEntities = require('html-entities');
const HTTPS = require('https');
const Path = require('path');
const QS = require('querystring');
const Rax = require('retry-axios');
const StripTags = require('striptags');
const Sugar = require(`sugar`);
const Tough = require('tough-cookie');
const Utility = require('@ranedrop/utility');
const Validator = require('@ranedrop/validator');

const GENERIC_RAX_CONFIG = {
    backoffType: 'static',
    onRetryAttempt: error => {
        console.log(`retrying!`);
        console.error(error.response.data);
    },
    retry: 10,
    retryDelay: 10000,
    statusCodesToRetry: [[429, 429]]
};

const SOURCE_HS_DOMAIN_ID = '';
const SOURCE_HS_DOMAIN_TYPE = '';
const SOURCE_HS_API_KEY_READ = '';
const SOURCE_HS_API_KEY_WRITE = '';
const SOURCE_HS_APP_ID = '';

const TARGET_HS_DOMAIN_ID = '';
const TARGET_HS_DOMAIN_TYPE = '';
const TARGET_HS_API_KEY_READ = '';
const TARGET_HS_API_KEY_WRITE = '';
const TARGET_HS_APP_ID = '';

async function compareIssueMetadata(p_parameters) {

    let parameters = Utility.ensureObject(p_parameters);
    let parameter_source_issues = parameters['source'];
    let parameter_target_issues = parameters['target'];

    let comparison_result = {
        'differences': {}
    };

    // Iterate over each target issue
    for (let current_target_issue_index in parameter_target_issues) {

        let current_target_issue = parameter_target_issues[current_target_issue_index];
        let current_target_issue_id = current_target_issue['id'];

        console.log(`\ncurrent_target_issue: ${current_target_issue.id}`);
        // console.log(current_target_issue);

        let current_target_issue_metadata_raw = current_target_issue['meta'];
        let current_target_issue_metadata = JSON.parse(current_target_issue_metadata_raw);

        if (!Validator.isValidObject(current_target_issue_metadata)) {
            console.warn(`The metadata section for the issue (${current_target_issue_id}) is not a valid Object instance: ${typeof current_target_issue_metadata}`);
            continue;
        }

        let metadata_field_imported_from = current_target_issue_metadata['Imported_from'];

        if (!Validator.isValidIndex(metadata_field_imported_from)) {
            console.warn(`There was no valid "Imported_from" value to use for cross-referencing the issue: (Target ID: ${current_target_issue_id}) ==> ${metadata_field_imported_from}`);
            continue;
        }

        let current_matching_source_issue = parameter_source_issues[metadata_field_imported_from];

        console.log(`metadata_field_imported_from: ${metadata_field_imported_from}`);
        // console.log(current_matching_source_issue);

        if (!Validator.isValidObject(current_matching_source_issue)) {
            console.error(`Error: The specified "Imported_from" value (${metadata_field_imported_from}) was not found in the source values.\n`);
            continue;
        }

        let current_matching_source_issue_metadata_raw = current_matching_source_issue['meta'];

        let current_matching_source_issue_metadata;

        try {
            current_matching_source_issue_metadata = JSON.parse(current_matching_source_issue_metadata_raw);
        }

        catch (e_exception) {
            console.error(e_exception);
        }

        if (!Validator.isValidObject(current_matching_source_issue_metadata)) {
            console.error(`Error: The matching source issue does not have a metadata property that is a valid Object instance: ${current_matching_source_issue_metadata}`);
        }

        console.log(`current_matching_source_issue ${current_matching_source_issue.id}\n`);
        // console.log(`current_matching_source_issue_metadata`);console.log(current_matching_source_issue_metadata);
        // console.log(`current_target_issue_metadata`);console.log(current_target_issue_metadata);
        
        let source_meta_identifier = current_matching_source_issue_metadata['identifier'];
        let source_meta_powerlift_gym = current_matching_source_issue_metadata['PowerLift Gym'];
        let source_meta_powerlift_incident = current_matching_source_issue_metadata['PowerLift Incident'];
        let source_meta_session_id = current_matching_source_issue_metadata['session_id'];
        let source_meta_user_id = current_matching_source_issue_metadata['user_id'];
        let source_meta_version = current_matching_source_issue_metadata['version'];
        
        let target_meta_identifier = current_target_issue_metadata['identifier'];
        let target_meta_powerlift_gym = current_target_issue_metadata['PowerLift Gym'];
        let target_meta_powerlift_incident = current_target_issue_metadata['PowerLift Incident'];
        let target_meta_session_id = current_target_issue_metadata['session_id'];
        let target_meta_user_id = current_target_issue_metadata['user_id'];
        let target_meta_version = current_target_issue_metadata['version'];

        let metadata_to_update = {};

        // Check Metadata Property: Identifier
        if (source_meta_identifier !== target_meta_identifier) {
            
            metadata_to_update['identifier'] = source_meta_identifier;
        }

        // Check Metadata Property: PowerLift Gym
        if (source_meta_powerlift_gym !== target_meta_powerlift_gym) {
            
            metadata_to_update['PowerLift Gym'] = source_meta_powerlift_gym;
        }

        // Check Metadata Property: PowerLift Incident
        if (source_meta_powerlift_incident !== target_meta_powerlift_incident) {
            
            metadata_to_update['PowerLift Incident'] = source_meta_powerlift_incident;
        }

        // Check Metadata Property: Session ID
        if (source_meta_session_id !== target_meta_session_id) {
            
            metadata_to_update['session_id'] = source_meta_session_id;
        }

        // Check Metadata Property: User ID
        if (source_meta_user_id !== target_meta_user_id) {
            
            metadata_to_update['user_id'] = source_meta_user_id;
        }

        // Check Metadata Property: Version
        if (source_meta_version !== target_meta_version) {
            
            metadata_to_update['version'] = source_meta_version;
        }

        // If there were any key/value pairs added to the set of metadata to update
        if (Object.keys(metadata_to_update).length > 0) {

            comparison_result['differences'][current_target_issue_id] = metadata_to_update;
        }
    }

    return comparison_result;
}

function constructBaseAPIURL(p_parameters) {

    let parameters = Utility.ensureObject(p_parameters);
    let param_domain = parameters.domain;

    let param_domain_adjusted = param_domain;

    if (!Validator.isValidObject(param_domain_adjusted)) {
        
        if (!Validator.isValidIndex(param_domain_adjusted)) {
            throw new Errors.InvalidDataTypeError(`The specified "domain" property must be a valid Object instance: ${param_domain_adjusted}`);
        }

        param_domain_adjusted = {
            id: param_domain_adjusted,
            type: ''
        };
    }

    let domain_id = param_domain_adjusted.id;
    let domain_type = `${param_domain_adjusted.type}`.toLowerCase(); // Force it to be a lower-cased string

    if (!Validator.isPopulatedString(domain_id)) {
        throw new Errors.InvalidDataTypeError(`The provided domain object must have an "id" property that is set to a populated string value: ${domain_id}`);
    }

    let api_subdomain = `api`;

    if (domain_type === `special`) {
        api_subdomain = `api-a`;
    }

    let constructed_base_url = `https://${api_subdomain}.helpshift.com/v1/${domain_id}`;

    return constructed_base_url;
}

function constructHostname(p_parameters) {

    let parameters = Utility.ensureObject(p_parameters);
    let param_domain = parameters.domain;

    if (!Validator.isValidObject(param_domain)) {
        
        throw new Errors.InvalidDataTypeError(`The specified "domain" property must be a valid Object instance: ${param_domain}`);
    }

    let domain_id = param_domain.id;

    if (!Validator.isPopulatedString(domain_id)) {
        throw new Errors.InvalidDataTypeError(`The provided domain object must have an "id" property that is set to a populated string value: ${domain_id}`);
    }

    let constructed_hostname = `${domain_id}.helpshift.com`;

    return constructed_hostname;
}

function convertArrayToObject(p_parameters) {

    let parameters = Utility.ensureObject(p_parameters);
    let param_index_property = parameters.index;
    let param_values = parameters.values;
    
    if (!Validator.isValidIndex(param_index_property)) {
        throw new Errors.ImproperParameterError(`The specified "index" property is not a valid index: ${param_index_property}`);
    }

    if (!Validator.isValidArray(param_values)) {
        throw new Errors.ImproperParameterError(`The specified "values" property is not a valid Array instance: ${param_values}`);
    }

    let converted_object = {};

    param_values.forEach(current_array_element => {

        let current_index_property_value = current_array_element[param_index_property];

        let existing_converted_value = converted_object[current_index_property_value];

        if (!Validator.isUndefined(existing_converted_value)) {
            console.warn(`The value at the index is being overwritten by a new value: ${current_index_property_value}`);
        }

        converted_object[current_index_property_value] = current_array_element;
    });

    return converted_object;
}

async function ingestCSVFile(p_parameters) {
    
    return new Promise((resolve, reject) => {
        
        let parameters = Utility.ensureObject(p_parameters);
        let param_file = parameters['file'];

        let file_data;
        let target_filename = param_file;
        
        if (!Validator.isPopulatedString(target_filename)) {
            throw new Errors.InvalidPathError(`The specified filename is invalid: ${target_filename}`);
        }

        let full_file_path_resolved = Path.resolve(target_filename);

        if (!Filesystem.existsSync(full_file_path_resolved)) {
            throw new Errors.FileNotFoundError(`The specified file could not be found: ${full_file_path_resolved}`);
        }
        
        file_data = [];

        Filesystem.createReadStream(full_file_path_resolved)
            .pipe(CSVParser.parse({headers: true}))
            .on('error', error => console.error(error))
            .on('data', row => {
                file_data.push(row);
            })
            .on('end', rowCount => {
                // console.log(`Parsed ${rowCount} rows from ${full_file_path_resolved}`);
                // console.log('file_data');console.log(file_data);
                resolve(file_data);
            });
    });
}

async function ingestIssues(p_file_path) {

    let ingested_rows = await ingestCSVFile({
        file: p_file_path
    });

    let data_rows = {};

    // console.log(`ingested_rows`);
    // console.log(ingested_rows);
    
    ingested_rows.forEach(current_row => {
        
        let current_row_adjusted = Object.assign({}, current_row);

        let current_row_id = current_row_adjusted['id'];
        let current_row_messages = current_row_adjusted['messages'] || current_row_adjusted['Message_data'];
        let current_row_metadata = current_row_adjusted['meta'];

        current_row_adjusted['messages'] = eval(current_row_messages);
        current_row_adjusted['source_id'] = current_row_adjusted['source_id'] || current_row_adjusted['Imported_from'];
        // current_row_adjusted['metadata'] = eval(current_row_metadata);

        data_rows[current_row_id] = current_row_adjusted;

        // console.log(data_rows[current_row_id]);
    });

    return data_rows;
}

async function executeComparison(p_parameters) {

    let parameters = Utility.ensureObject(p_parameters);

    let param_source = parameters['source'];
    let param_target = parameters['target'];
    
    // Ingest issues from source file
    let source_data = await ingestIssues(param_source);

    // Ingest issues from target file
    let target_data = await ingestIssues(param_target);

    let target_issues_not_to_fix = {};
    let target_issues_to_fix = {};

    // Compare the messages for each issue
    for (let current_target_id in target_data) {

        let current_target_object = target_data[current_target_id];

        let current_source_id = current_target_object['source_id'];
        // console.log(`current_source_id: ${current_source_id}`);
        // console.log(`current_target_id: ${current_target_id}`);

        // Compare the current messages 
        let current_source_object = source_data[current_source_id];
        
        if (!Validator.isValidObject(current_source_object)) {
            console.warn(`There was no matching source object for the ID: ${current_target_id} (source ID: ${current_source_id})`);
            continue;
        }

        let current_source_messages = current_source_object['messages'];
        let current_target_messages = current_target_object['messages'];

        let message_comparison_result = compareMessages({
            source: current_source_messages,
            target: current_target_messages
        });

        current_target_object['message_comparison'] = message_comparison_result;

        if (message_comparison_result['mismatches'].length === 0) {
            // console.log(`there were no mismatches`);
            target_issues_not_to_fix[current_target_id] = current_target_object;
        }

        else {
            target_issues_to_fix[current_target_id] = current_target_object;
        }
    }

    console.log(`Number of issues that need to be fixed: ${Object.keys(target_issues_to_fix).length}`);

    let domain_data = getHS_domain();

    // Retrieve all of the agents that exist on the system
    let existing_agents_target = await getAgents({
        domain: domain_data,
        key: HS_API_KEY_READ
    });

    // console.log(existing_agents_target);
    // Iterate over each issue that has an issue that needs to be fixed
    
    let csv_filename_date_suffix = (new Date).toISOString().replace(/\W/g, '_');
    let csv_output_file_name = `output_${csv_filename_date_suffix}.csv`;
    let csv_writer_object;

    // console.log(target_issues_to_fix);
    for (let current_target_issue_index in target_issues_to_fix) {
        
        let current_issue_to_fix = target_issues_to_fix[current_target_issue_index];
        let current_issue_to_fix_message_comparison = current_issue_to_fix['message_comparison'];

        // Retrieve the fresh issue from the API
        let target_issue_fresh = await getIssueByID({
            domain: domain_data,
            id: current_issue_to_fix['issue_id'],
            key: HS_API_KEY_READ
        });

        // Merge the issues that already exist on the target (matches) with the issues that were missing (mismatches)
        let compared_messages_merged = [].concat(current_issue_to_fix_message_comparison['matches'],current_issue_to_fix_message_comparison['mismatches']);
        let compared_messages_merged_sorted = compared_messages_merged.concat();
        compared_messages_merged_sorted.sort((a, b) => a.created_at - b.created_at);

        let current_reconstructed_issue_data = Sugar.Object.clone(target_issue_fresh, true);
        current_reconstructed_issue_data['messages'] = compared_messages_merged;
        
        // Write output for future use
        csv_writer_object = await writeIssueToCSV({
            filename: csv_output_file_name,
            issue: current_reconstructed_issue_data,
            writerObject: csv_writer_object
        });

        // console.log('target_issue_fresh');console.log(target_issue_fresh);
        // console.log('compared_messages_merged_sorted');console.log(compared_messages_merged_sorted);

        let target_issue_messages = target_issue_fresh['messages'];
        
        // Redact all currently existing messages by their IDs (do not redact notes)
        redactMessages({
            domain: domain_data,
            key: HS_API_KEY_WRITE,
            messages: target_issue_messages
        });
        console.log(`# of issue messages to redact: ${target_issue_messages.length}\n`);
    }

}

async function executeMetadataComparison(p_parameters) {

    let issues_from_aws = await getAWSIssues({
        skipRemote: true
    });

    let issues_from_azure = await getAzureIssues({
        skipRemote: true
    });
    
    let issues_from_aws_objectified = convertArrayToObject({index: 'id', values: issues_from_aws});
    let issues_from_azure_objectified = convertArrayToObject({index: 'id', values: issues_from_azure});
    
    // Compare issue metadata between source(azure) and target(aws)
    let comparison_results = await compareIssueMetadata({
        source: issues_from_azure_objectified,
        target: issues_from_aws_objectified
    });

    let metadata_differences = comparison_results['differences'];
    let num_issues_updated = 0;

    for (let current_metadata_difference_index in metadata_differences) {

        let current_metadata_difference = metadata_differences[current_metadata_difference_index];

        let current_operation_parameters = {
            domain: getHS_domain_target(),
            id: current_metadata_difference_index,
            key: TARGET_HS_API_KEY_WRITE,
            metadata: current_metadata_difference
        };
        console.log(`current_operation_parameters`);console.log(current_operation_parameters);console.log('\n');

        await updateIssueMetadata(current_operation_parameters);

        num_issues_updated++;
    }

    console.log(`Total amount of issues updated is: ${num_issues_updated}`);
}

async function getAWSIssues(p_parameters) {

    let parameters = Utility.ensureObject(p_parameters);
    let param_skip_remote = (parameters['skipRemote'] === true);
    
    let all_issues = [];
    let created_since;
    let issue_ids_to_exclude = [];
    let last_issue_from_csv;

    try {

        // Retrieve all of the CSV issues for AWS
        let issues_from_aws_local = await ingestCSVFile({
            file: 'output/metadata/microsoft-todo.csv'
        });
        
        if (Validator.isPopulatedArray(issues_from_aws_local)) {
            
            let num_total_issues = issues_from_aws_local.length;

            last_issue_from_csv = issues_from_aws_local[num_total_issues - 1];

            if (Validator.isValidObject(last_issue_from_csv)) {

                all_issues = all_issues.concat(issues_from_aws_local);
                
                let last_issue_created_at = last_issue_from_csv['created_at'];
                let last_issue_id = last_issue_from_csv['id'];

                let last_issue_created_at_date_object = Sugar.Date.create(last_issue_created_at);
                
                if (Validator.isValidDateObject(last_issue_created_at_date_object)) {

                    created_since = last_issue_created_at_date_object.valueOf();
                }

                if (Validator.isValidIndex(last_issue_id)) {

                    issue_ids_to_exclude.push(last_issue_id);
                }
            }
        }
        console.log(`created_since: ${created_since} (${issue_ids_to_exclude[0]})`);
    }

    catch (e_exception) {
        console.error(e_exception.message);
    }

    if (param_skip_remote !== true) {

        // Retrieve all of the relevant issues from AWS
        let issues_from_aws_remote = await getIssues({
            createdSince: created_since,
            domain: {
                id: TARGET_HS_DOMAIN_ID,
                type: ''
            },
            exclude: issue_ids_to_exclude,
            key: TARGET_HS_API_KEY_READ,
            tags: ['imported_from_azure'],
        });

        all_issues = all_issues.concat(Utility.ensureArray(issues_from_aws_remote));
    }

    return all_issues;
}

async function getAzureIssues(p_parameters) {

    let parameters = Utility.ensureObject(p_parameters);
    let param_skip_remote = (parameters['skipRemote'] === true);
    
    let all_issues = [];
    let created_since;
    let issue_ids_to_exclude = [];
    let last_issue_from_csv;

    try {

        // Retrieve all of the CSV issues for Azure
        let issues_from_azure_local = await ingestCSVFile({
            file: 'output/metadata/todosupport.csv'
        });
        
        if (Validator.isPopulatedArray(issues_from_azure_local)) {
            
            let num_total_issues = issues_from_azure_local.length;

            last_issue_from_csv = issues_from_azure_local[num_total_issues - 1];

            if (Validator.isValidObject(last_issue_from_csv)) {

                all_issues = all_issues.concat(issues_from_azure_local);
                
                let last_issue_created_at = last_issue_from_csv['created_at'];
                let last_issue_id = last_issue_from_csv['id'];

                let last_issue_created_at_date_object = Sugar.Date.create(last_issue_created_at);
                
                if (Validator.isValidDateObject(last_issue_created_at_date_object)) {

                    created_since = last_issue_created_at_date_object.valueOf();
                }

                if (Validator.isValidIndex(last_issue_id)) {

                    issue_ids_to_exclude.push(last_issue_id);
                }
            }
        }
        console.log(`created_since: ${created_since} (${issue_ids_to_exclude[0]})`);
    }

    catch (e_exception) {
        console.error(e_exception.message);
    }
    
    if (param_skip_remote !== true) {

        // Retrieve all of the issues from Azure
        let issues_from_azure_remote = await getIssues({
            createdSince: created_since,
            domain: {
                id: SOURCE_HS_DOMAIN_ID,
                type: 'special'
            },
            exclude: issue_ids_to_exclude,
            key: SOURCE_HS_API_KEY_READ,
            tags: []
        });

        all_issues = all_issues.concat(Utility.ensureArray(issues_from_azure_remote));
    }

    return all_issues;
}

function getHS_app() {

    return {
        id: HS_APP_ID || process.env.HS_APP_ID,
        name: HS_APP_URL || process.env.HS_APP_URL
    };
}

function getHS_domain() {

    return {
        id: HS_DOMAIN_ID || process.env.HS_DOMAIN_ID,
        type: HS_DOMAIN_TYPE || process.env.HS_DOMAIN_TYPE
    };
}

function getHS_domain_source() {

    return {
        id: SOURCE_HS_DOMAIN_ID || process.env.SOURCE_HS_DOMAIN_ID,
        type: SOURCE_HS_DOMAIN_TYPE || process.env.SOURCE_HS_DOMAIN_TYPE
    };
}

function getHS_domain_target() {

    return {
        id: TARGET_HS_DOMAIN_ID || process.env.TARGET_HS_DOMAIN_ID,
        type: TARGET_HS_DOMAIN_TYPE || process.env.TARGET_HS_DOMAIN_TYPE
    };
}

function getHS_keys() {

    return {
        read: HS_KEY_READ || process.env.HS_KEY_READ,
        write: HS_KEY_WRITE || process.env.HS_KEY_WRITE
    };
}

async function getIssueByID(p_parameters) {

    let params = Utility.ensureObject(p_parameters);

    let param_domain = params.domain;
    let param_id = params['id'];
    let param_key = params.key;
    let param_page = params.page;
    let param_page_limit = params.pageLimit;
    let param_page_size = params.pageSize;

    let base_url = constructBaseAPIURL({domain: param_domain});
    let page_limit = parseInt(param_page_limit) || undefined;
    let current_page_number = parseInt(param_page) || 1;
    let page_size = parseInt(param_page_size) || 100

    if (!Validator.isValidIndex(param_id)) {
        throw new Errors.ImproperParameterError(`The specified ID is not valid: ${param_id}`);
    }

    let auth_object = {
        username: param_key,
        password: param_key
    };

    let full_url = `${base_url}/issues/${param_id}`;
    let query_parameters = {};
    // query_parameters['page'] = current_page_number;
    // query_parameters['page_size'] = page_size;
    
    // Fire a request to DOMAIN to retrieve all agents
    try {

        let request_operation_config = {
            auth: auth_object,
            headers: {
                // 'Accept': 'application/json'
            },
            method: `GET`,
            params: query_parameters,
            raxConfig: GENERIC_RAX_CONFIG,
            url: full_url
        };
        
        let request_operation = await Axios(request_operation_config);
        
        let request_operation_status = request_operation.status;

        if (request_operation_status !== 200) {
            throw new Errors.DataRetrievalError(`An unexpected status was retured while retrieving the FAQ articles: ${request_operation_status}`);
        }

        let request_operation_data = request_operation.data;

        if (!Validator.isValidObject(request_operation_data)) {
            throw new Errors.DataMismatchError(`The data is not in the form of a valid Object instance: ${request_operation_data}`);
        }

        let retrieved_issues = request_operation_data['issues'];
        let retrieved_page_number = request_operation_data['page'];
        let retrieved_page_size = request_operation_data['page-size'];
        let retrieved_total_hits = request_operation_data['total-hits'];
        let retrieved_total_page_number = request_operation_data['total-pages'];

        // TODO: The call needs to paginate

        if (!Validator.isValidArray(retrieved_issues)) {
            throw new Errors.DataMismatchError(`The data is not in the form of a valid Array instance: ${retrieved_issues}`);
        }

        if (retrieved_issues.length === 0) {
            throw new Errors.DataNotFoundError(`An issue corresponding to the specified ID was not found: ${param_id}`);
        }

        else if (retrieved_issues.length > 1) {
            throw new Errors.ExcessiveDataError(`There were more than one issue returned in response to the retrieval of one issue, based on its ID: ${param_id}`);
        }

        let retrieved_issue = retrieved_issues[0];

        return retrieved_issue;
    }

    catch (e_exception) {
        
        console.error(`Something went wrong with the retrieval of the specified issue by its ID: ${param_id}`)
        console.error(e_exception);
    }


        // Make those agent objects referenceable by using the e-mail address and name as indexes (separately, so accessing either via index returns an object).
        // E-mail address takes precedence
}

async function getIssues(p_parameters) {

    let params = Utility.ensureObject(p_parameters);

    let param_created_since = params['createdSince'];
    let param_domain = params.domain;
    let param_exclude = params['exclude'];
    let param_key = params.key;
    let param_page = params.page;
    let param_page_limit = params.pageLimit;
    let param_page_size = params.pageSize;
    let param_tags = params['tags'];

    let base_url = constructBaseAPIURL({domain: param_domain});
    let excluded_issue_ids = Utility.ensureArray(param_exclude);
    let page_limit = parseInt(param_page_limit) || undefined;
    let current_page_number = parseInt(param_page) || 1;
    let page_size = parseInt(param_page_size) || 1000
    let tags = Utility.ensureArray(param_tags);

    let retrieved_issues = {};

    let auth_object = {
        username: param_key,
        password: param_key
    };

    let full_url = `${base_url}/issues`;
    let query_parameters = {};
    query_parameters['includes'] = JSON.stringify(['meta','queue']);
    query_parameters['page'] = current_page_number;
    query_parameters['page-size'] = page_size;
    query_parameters['timestamp-format'] = 'iso-8601';
    query_parameters['sort-by'] = 'creation-time';
    query_parameters['sort-order'] = 'asc';

    if (Validator.isValidNumber(param_created_since) || Validator.isPopulatedString(param_created_since)) {

        query_parameters['created_since'] = param_created_since;
    }

    if (Validator.isPopulatedArray(tags)) {

        let tags_object = {};
        tags_object['or'] = tags;

        query_parameters['tags'] = tags_object;
    }
    
    // Fire a request to DOMAIN to retrieve all agents
    try {

        let request_operation_config = {
            auth: auth_object,
            headers: {
                // 'Accept': 'application/json'
            },
            method: `GET`,
            params: query_parameters,
            raxConfig: GENERIC_RAX_CONFIG,
            url: full_url
        };
        
        let request_operation = await Axios(request_operation_config);
        
        let request_operation_status = request_operation.status;

        if (request_operation_status !== 200) {
            throw new Errors.DataRetrievalError(`An unexpected status was retured while retrieving the FAQ articles: ${request_operation_status}`);
        }

        let request_operation_data = request_operation.data;

        if (!Validator.isValidObject(request_operation_data)) {
            throw new Errors.DataMismatchError(`The data is not in the form of a valid Object instance: ${request_operation_data}`);
        }

        let retrieved_issues = request_operation_data['issues'];
        let retrieved_page_number = request_operation_data['page'];
        let retrieved_page_size = request_operation_data['page-size'];
        let retrieved_total_hits = request_operation_data['total-hits'];
        let retrieved_total_page_number = request_operation_data['total-pages'];

        if (!Validator.isValidArray(retrieved_issues)) {
            throw new Errors.DataMismatchError(`The data is not in the form of a valid Array instance: ${retrieved_issues}`);
        }
            
        let filename_for_writing = `${param_domain.id}.csv`;
    
        let retrieved_issues_adjusted = [];
        
        // Write retrieved issues to file
        for (let current_retrieved_issue_index in retrieved_issues) {
    
            let current_issue = retrieved_issues[current_retrieved_issue_index];
            let current_issue_id = current_issue['id'];
            
            // If the current issue ID is found in the array of excluded issue IDs
            if (excluded_issue_ids.indexOf(`${current_issue_id}`) >= 0) {
                // console.log(`Last issue matched!`);
                continue;
            }
    
            retrieved_issues_adjusted.push(current_issue);
            
            await writeIssueToCSV({
                filename: filename_for_writing,
                issue: current_issue
            });
        }
    
        console.log(`Finished writing ${retrieved_issues_adjusted.length} issues to ${filename_for_writing}\n\n`);

        // If there are still more pages to retrieve
        if (current_page_number < retrieved_total_page_number) {

            let next_page_number = current_page_number + 1;
            console.log(`Retrieving the next page of issues: ${next_page_number}`)
            let retrieved_issues_next_page = await getIssues({
                createdSince: param_created_since,
                domain: param_domain,
                exclude: param_exclude,
                key: param_key,
                page: next_page_number,
                pagetLimit: param_page_limit,
                pageSize: param_page_size,
                tags: param_tags
            });

            retrieved_issues_adjusted = retrieved_issues_adjusted.concat(retrieved_issues_next_page);
        }

        // console.log('retrieved_issues_adjusted');console.log(retrieved_issues_adjusted);

        return retrieved_issues_adjusted;
    }

    catch (e_exception) {
        
        console.error(`Something went wrong with the retrieval of multiple issues.`)
        console.error(e_exception.message);
        if (e_exception.response) {
            console.error(e_exception.response.data)
        }
    }


        // Make those agent objects referenceable by using the e-mail address and name as indexes (separately, so accessing either via index returns an object).
        // E-mail address takes precedence
}

async function writeIssueToCSV(p_parameters) {
        
    let parameters = Utility.ensureObject(p_parameters);
    let param_filename = parameters['filename'];
    let param_issue = parameters['issue'];
    let param_writer_object = parameters['writerObject'];

    if (!Validator.isPopulatedString(param_filename)) {
        throw new Errors.ImproperParameterError(`The filename property must be a valid string: ${param_filename}`);
    }

    let output_file_relative_path = `output/metadata/${param_filename}`;

    let csv_writer_properties = {
        path: output_file_relative_path
    };

    if (Filesystem.existsSync(output_file_relative_path)) {
        csv_writer_properties['append'] = true;
    }

    // csv_writer_properties['header'] = [
    //     {id: 'issue_id', title: 'Issue ID'},
    //     {id: 'assignee_id', title: 'Assignee ID'},
    //     {id: 'assignee_name', title: 'Assignee Name'},
    //     {id: 'author_hs_id', title: 'Author Helpshift ID'},
    //     {id: 'author_name', title: 'Author Name'},
    //     // {id: 'messages', title: 'Messages'},
    //     {id: 'metadata', title: 'Metadata'},
    //     {id: 'queue_id', title: 'Queue ID'},
    //     {id: 'queue_name', title: 'Queue Name'},
    //     {id: 'created_at', title: 'Date Created'},
    //     {id: 'updated_at', title: 'Date Updated'},
    // ];

    csv_writer_properties['header'] = [
        {id: 'id', title: 'id'},
        {id: 'assignee_id', title: 'assignee_id'},
        {id: 'assignee_name', title: 'assignee_name'},
        {id: 'author_hs_id', title: 'author_hs_id'},
        {id: 'author_name', title: 'author_name'},
        {id: 'messages', title: 'messages'},
        {id: 'meta', title: 'meta'},
        {id: 'queue_id', title: 'queue_id'},
        {id: 'queue_name', title: 'queue_name'},
        {id: 'created_at', title: 'created_at'},
        {id: 'updated_at', title: 'updated_at'},
    ];

    const create_csv_writer = CSVWriter.createObjectCsvWriter;
    let csv_writer = param_writer_object;

    if (!Validator.isValidObject(csv_writer)) {
        csv_writer = create_csv_writer(csv_writer_properties);
    }
    
    let param_issue_metadata = JSON.stringify(Utility.ensureObject(param_issue['meta']));
    // console.log(`param_issue['meta']`);console.log(param_issue['meta']);
    // console.log(`param_issue_metadata`);console.log(param_issue_metadata);
    let param_issue_queue = param_issue['queue'];

    let records_to_write = [];
    let current_record_to_write = {
        id: param_issue.id,
        assignee_id: param_issue.assignee_id,
        assignee_name: param_issue.assignee_name,
        author_hs_id: param_issue.hs_user_id,
        author_name: param_issue.author_name,
        created_at: param_issue.created_at,
        meta: `${param_issue_metadata}`,
        queue_id: param_issue_queue.id,
        queue_name: param_issue_queue.name,
        updated_at: param_issue.updated_at,
        messages: JSON.stringify(param_issue.messages)
    };
    
    records_to_write.push(current_record_to_write);
    
    await csv_writer.writeRecords(records_to_write);

    return csv_writer;
}

async function loginTest() {

    let cookie_jar = new Tough.CookieJar();

    let instance = await Axios.create({
        jar: cookie_jar,
        withCredentials: true,
        httpsAgent: new HTTPS.Agent({
            rejectUnauthorized: false,
            requestCert: true,
            keepAlive: true
        }),
        xsrfCookieName: '_csrf_token',
        xsrfHeaderName: `X-CSRF-TOKEN`
    });

    let login_url = 'https://kiley-demo.helpshift.com/login/';
    let res = await instance.get(login_url, { withCredentials: true });
    
    let cookies = await cookie_jar.getCookiesSync(login_url);
    console.log(`cookies`);console.log(cookies);
    try {
        // instance.defaults.headers['x-xsrf-token'] = cookies[0].value;
        instance.defaults.headers['referrer'] = login_url;
        
        await instance.post(login_url, {
            username: 'kiley@helpshift.com',
            password: 'Testing123!',
            _csrf_token: cookies[0].value,
            _csrf_token_legacy: cookies[1].value,
            next: ""
        });
        
        // let request_operation_config = {
        //     // auth: auth_object,
        //     data: QS.stringify({
        //         username: 'kiley@helpshift.com',
        //         password: 'Testing123!',
        //         _csrf_token: cookies[0].value
        //     }),
        //     headers: {
        //         'content-type': 'application/x-www-form-urlencoded'
        //     },
        //     method: `POST`,
        //     raxConfig: GENERIC_RAX_CONFIG,
        //     url: `https://kiley-demo.helpshift.com/login/`
        // };
        
        // let request_operation = await Axios(request_operation_config);

        // console.log('status');
        // console.log(request_operation.status);

        // console.log('token');console.log(cookies);
    }

    catch (e_exception) {
        console.error(e_exception.request);
    }
}

async function updateIssueMetadata(p_parameters) {
    
    let parameters = Utility.ensureObject(p_parameters);
    let param_domain = parameters['domain'];
    let param_issue_id = parameters['id'];
    let param_key = parameters['key'];
    let param_metadata = parameters['metadata'];
    
    let base_url = constructBaseAPIURL({domain: param_domain});

    let auth_object = {
        username: param_key,
        password: param_key
    };
    let full_url = `${base_url}/issues/${param_issue_id}`;

    let issue_metadata_update_properties = {};
    issue_metadata_update_properties['meta'] = JSON.stringify(param_metadata);
    console.log(`Updating the metadata for ID #${param_issue_id}`);
    try {

        let request_operation_config = {
            auth: auth_object,
            data: QS.stringify(issue_metadata_update_properties),
            headers: {
                'content-type': 'application/x-www-form-urlencoded'
            },
            method: `PUT`,
            raxConfig: GENERIC_RAX_CONFIG,
            url: full_url
        };
        // console.log(`request_operation_config`);console.log(request_operation_config);
        
        let request_operation = await Axios(request_operation_config);
        
        let request_operation_status = request_operation.status;
        // console.log('request_operation.data');console.log(request_operation.data);
        if ((request_operation_status !== 200) && (request_operation_status !== 201)) {
            throw new Errors.DataRetrievalError(`An unexpected status was retured while redacting the messages: ${request_operation_status}`);
        }
        console.log(`success!\n`);
        
        return true;
    }

    catch (e_exception) {

        console.error(`Something went wrong with the redaction of a message.`);
        console.error(JSON.stringify(issue_metadata_update_properties));
        console.error(e_exception);
    }
}

// Test Area
let interceptor_id = Rax.attach();
AxiosCookieJarSupport(Axios);

// executeComparison({
//     source: 'data/flipgrid_open.csv',
//     // target: 'data/flipgridsupport.csv'
//     target: 'data/flipgridsupport_webchat.csv'
// });

let test_messages_to_redact = [
    'kiley-demo_message_20210309161353432-b4ebb3f7cc6e8fc',
    'kiley-demo_message_20210309161411584-68e265f770e8e62'
];

// redactAndReplayMessages({
//     publishID: 20, // 
//     domain: 'kiley-demo',
//     issue: 814,
//     messages: test_messages_to_redact,
//     readKey: '',
//     writeKey: ''
// });

// loginTest();

executeMetadataComparison();