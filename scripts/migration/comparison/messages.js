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
const { ensureArray } = require('@ranedrop/utility');
const { default: axios } = require('axios');

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

const HS_DOMAIN_ID = 'flipgridsupport';
const HS_DOMAIN_TYPE = '';
const HS_API_KEY_READ = 'flipgridsupport_api_20210308140907621-784fba9e1e2a96e';
const HS_API_KEY_WRITE = '';
const HS_APP_ID = 'flipgridsupport_app_20210204194208129-80db666c98cebc6';

// const HS_DOMAIN_ID = 'kiley-demo';
// const HS_DOMAIN_TYPE = ``;
// const HS_API_KEY_READ = 'kiley-demo_api_20200903113320111-3ef245d31d67847';
// const HS_API_KEY_WRITE = 'kiley-demo_api_20200903113320111-3ef245d31d67847';
// const HS_APP_ID = 'kiley-demo_app_20210303135720152-9f95c6c6e71ca99'; // Dev12

function cleanHTML(p_string_value) {

    let return_value = p_string_value;

    if (Validator.isValidString(return_value)) {

        return_value = HTMLEntities.decode(return_value);
        return_value = StripTags(return_value);
        return_value = HTMLEntities.decode(return_value);
        return_value = StripTags(return_value);
    }

    return return_value;
}

function compareMessages(p_parameters) {
        
    let parameters = Utility.ensureObject(p_parameters);
    let param_source_messages = parameters['source'];
    let param_target_messages = parameters['target'];

    if (!Validator.isValidArray(param_source_messages)) {
        throw new Errors.ImproperParameterError(`The specified source array is invalid: ${param_source_messages}`);
    }

    if (!Validator.isValidArray(param_target_messages)) {
        throw new Errors.ImproperParameterError(`The specified source array is invalid: ${param_target_messages}`);
    }

    let param_target_messages_objectified = {};

    let param_target_messages_flattened = param_target_messages.map(current_value => {
        
        let current_value_body = `${current_value['body']}`;
        let current_value_body_adjusted = cleanHTML(current_value_body);
        let current_value_origin = current_value['origin'];
        let current_value_search_index = `${current_value_origin}_${current_value_body_adjusted}`;

        param_target_messages_objectified[current_value_search_index] = ensureArray(param_target_messages_objectified[current_value_search_index]);
        param_target_messages_objectified[current_value_search_index].push(current_value);
        
        if (current_value_body !== current_value_body_adjusted) {
            // console.log('see it!');
            // console.log(current_value_body);
            // console.log(current_value_body_adjusted);
        }
        
        return current_value_body_adjusted;
        
    }); // Make a copy

    let matches_found = [];
    let mismatches_found = [];

    for (let source_message_index in param_source_messages) {

        let current_source_message = param_source_messages[source_message_index];
        let current_source_message_body = `${current_source_message['body']}`;
        let current_source_message_origin = current_source_message['origin'];
        
        let current_source_message_body_adjusted = cleanHTML(current_source_message_body);

        let source_search_index = `${current_source_message_origin}_${current_source_message_body_adjusted}`;
        
        // let current_message_cross_index = param_target_messages_flattened.indexOf(current_source_message_body_adjusted);
        let referenced_message = param_target_messages_objectified[source_search_index];
        
        current_source_message['body_adjusted'] = current_source_message_body_adjusted;

        // If the current source message is unable to be found in the array of target messages
        // if (current_message_cross_index < 0) {
        if (Validator.isUndefinedOrNull(referenced_message)) {
            
            mismatches_found.push(current_source_message)
        }

        else {
            // console.log(`got a match: ${current_source_message_body}`);
            matches_found.push(current_source_message);

            param_target_messages_objectified[source_search_index].pop();

            if (param_target_messages_objectified[source_search_index].length < 1) {
                delete param_target_messages_objectified[source_search_index];
            }
        }
        // param_target_messages_flattened.splice(current_message_cross_index, 1);
    }

    return {
        matches: matches_found,
        mismatches: mismatches_found,
    };
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

        let current_row_id = current_row_adjusted['id'] || current_row_adjusted['issue_id'];
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

async function getAgents(p_parameters) {

    let params = Utility.ensureObject(p_parameters);

    let param_app_id = params.app;
    let param_domain = params.domain;
    let param_key = params.key;
    let param_page = params.page;
    let param_page_limit = params.pageLimit;
    let param_page_size = params.pageSize;

    let base_url = constructBaseAPIURL({domain: param_domain});
    let page_limit = parseInt(param_page_limit) || undefined;
    let current_page_number = parseInt(param_page) || 1;
    let page_size = parseInt(param_page_size) || 100

    if (!Validator.isUndefined(page_limit)) {

        if (page_limit < 1) {
            throw new Errors.DataMinimumNotReachedError(`The page limit must be at least 1: ${page_limit}`);
        }
    }

    if (current_page_number < 1) {
        throw new Errors.DataMinimumNotReachedError(`The page value must be at least 1: ${current_page_number}`);
    }

    if (page_size < 1) {
        throw new Errors.DataMinimumNotReachedError(`The page size value must be at least 1: ${page_size}`);
    }

    if (page_size > 100) {
        throw new Errors.DataMinimumNotReachedError(`The maximum page size is 100: ${page_size}`);
    }

    let auth_object = {
        username: param_key,
        password: param_key
    };

    let full_url = `${base_url}/agents`;
    let query_parameters = {};
    query_parameters['page'] = current_page_number;
    query_parameters['page_size'] = page_size;
    
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

        let retrieved_agent_profiles_array = request_operation_data['profiles'];
        let retrieved_page_number = request_operation_data['page'];
        let retrieved_page_size = request_operation_data['page-size'];
        let retrieved_total_hits = request_operation_data['total-hits'];
        let retrieved_total_page_number = request_operation_data['total-pages'];

        // TODO: The call needs to paginate

        if (!Validator.isValidArray(retrieved_agent_profiles_array)) {
            throw new Errors.DataMismatchError(`The data is not in the form of a valid Array instance: ${retrieved_agent_profiles_array}`);
        }

        let profiles_object = {};

        retrieved_agent_profiles_array.forEach(current_profile => {

            let current_profile_email_address = current_profile['email'];
            let current_profile_name = current_profile['name'];

            profiles_object[current_profile_email_address] = current_profile;

            if (Validator.isPopulatedString(current_profile_name)) {

                let current_profile_name_adjusted = current_profile_name.toLowerCase();

                // If a value has been defined at the index for the name
                if (!Validator.isUndefinedOrNull(profiles_object[current_profile_name_adjusted])) {
                    console.warn(`A profile with this name has already been set. It will be overwritten.`);
                    console.warn(profiles_object[current_profile_name_adjusted]);
                }

                profiles_object[current_profile_name_adjusted] = current_profile;
            }
        });

        return profiles_object;
    }

    catch (e_exception) {
        
        console.error(`Something went wrong with the retrieval of the domain's agents.`)
        console.error(e_exception);
    }


        // Make those agent objects referenceable by using the e-mail address and name as indexes (separately, so accessing either via index returns an object).
        // E-mail address takes precedence
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

async function redactAndReplayMessages(p_parameters) {
        
    let parameters = Utility.ensureObject(p_parameters);
    let param_domain = parameters['domain'];
    let param_issue_id = parameters['issue'];
    let param_message_ids = parameters['messages'];
    let param_publish_id = parameters['publishID'];
    let param_key_read = parameters['readKey'];
    let param_key_write = parameters['writeKey'];

    let redacted_messages = await redactMessages({
        domain: param_domain,
        messages: param_message_ids,
        publishID: param_publish_id,
        key: param_key_write
    });

    console.log(`redacted_messages`);console.log(redacted_messages);
}

async function redactMessage(p_parameters) {
        
    let parameters = Utility.ensureObject(p_parameters);
    let param_domain = parameters['domain'];
    let param_message_id = parameters['id'];
    let param_publish_id = parameters['publishID'];
    let param_key = parameters['key'];

    console.log(`Redacting message from: ${param_message_id}`);//console.log(current_message);
    
    let base_url = constructBaseAPIURL({domain: param_domain});

    let auth_object = {
        username: param_key,
        password: param_key
    };
    let full_url = `${base_url}/redactions`;

    let message_redaction_requests = [];

    if (Validator.isValidIndex(param_message_id)) {
        
        message_redaction_requests.push({
            redaction_type: 'message',
            property: 'message_id',
            value: `${param_message_id}`,
            app_publish_id: `${param_publish_id}`
        });
    }

    else if (Validator.isPopulatedArray(param_message_id)) {

        let message_ids_array = param_message_id;

        message_ids_array.forEach(current_message_id => {
            
            message_redaction_requests.push({
                redaction_type: 'message',
                property: 'message_id',
                value: `${current_message_id}`,
                app_publish_id: `${param_publish_id}`
            });
        });
    }

    let message_redaction_properties = {};
    message_redaction_properties['requests'] = message_redaction_requests;

    // console.log(`message_redaction_requests`);console.log(message_redaction_requests);
    // return;
    try {

        let request_operation_config = {
            auth: auth_object,
            data: QS.stringify(message_redaction_properties),
            headers: {
                'content-type': 'application/x-www-form-urlencoded'
            },
            method: `POST`,
            raxConfig: GENERIC_RAX_CONFIG,
            url: full_url
        };
        
        let request_operation = await Axios(request_operation_config);
        
        let request_operation_status = request_operation.status;
        console.log('request_operation.data');console.log(request_operation.data);
        if ((request_operation_status !== 200) && (request_operation_status !== 201)) {
            throw new Errors.DataRetrievalError(`An unexpected status was retured while redacting the messages: ${request_operation_status}`);
        }
        
        let request_operation_data = request_operation.data;

        if (!Validator.isValidObject(request_operation_data)) {
            throw new Errors.DataMismatchError(`The data is not in the form of a valid Object instance: ${request_operation_data}`);
        }

        console.log('request_operation_data');console.log(request_operation_data);
        let redaction_operation_response = request_operation_data['response'];

        // let created_article = request_operation_data;
        
        return created_article;
    }

    catch (e_exception) {

        console.error(`Something went wrong with the redaction of a message.`);
        console.error(JSON.stringify(message_redaction_properties));
        console.error(e_exception);
    }
}

async function redactMessages(p_parameters) {
        
    let parameters = Utility.ensureObject(p_parameters);
    let param_domain = parameters['domain'];
    let param_messages = parameters['messages'];
    let param_publish_id = parameters['publishID'];
    let param_key = parameters['key'];

    if (!Validator.isValidArray(param_messages) && !Validator.isValidObject(param_messages)) {
        throw new Errors.ImproperParameterError(`The messages property must be a valid Array or Object instance: ${param_messages}`);
    }

    let redacted_messages = [];

    // Iterate over each message
    for (let current_message_index in param_messages) {

        let current_message = param_messages[current_message_index];
        let current_message_id = current_message;

        if (Validator.isValidObject(current_message)) {

            current_message_id = current_message['id'];

            if (!Validator.isValidIndex(current_message_id)) {
                throw new Errors.DataNotFoundError(`There was no valid ID found in the specified object: ${current_message_id}`);
            }
        }

        let current_redaction_result = await redactMessage({
            domain: param_domain,
            key: param_key,
            id: current_message_id,
            publishID: param_publish_id
        });

        redacted_messages.push(current_message);

        console.log(current_redaction_result);
    }

    return redacted_messages;
}

async function writeIssueToCSV(p_parameters) {
        
    let parameters = Utility.ensureObject(p_parameters);
    let param_filename = parameters['filename'];
    let param_issue = parameters['issue'];
    let param_writer_object = parameters['writerObject'];

    if (!Validator.isPopulatedString(param_filename)) {
        throw new Errors.ImproperParameterError(`The filename property must be a valid string: ${param_filename}`);
    }

    let output_file_relative_path = `output/${param_filename}`;

    let csv_writer_properties = {
        path: output_file_relative_path
    };

    if (Filesystem.existsSync(output_file_relative_path)) {
        csv_writer_properties['append'] = true;
    }

    csv_writer_properties['header'] = [
        {id: 'issue_id', title: 'Issue ID'},
        {id: 'assignee_id', title: 'Assignee ID'},
        {id: 'assignee_name', title: 'Assignee Name'},
        {id: 'author_hs_id', title: 'Author Helpshift ID'},
        {id: 'author_name', title: 'Author Name'},
        // {id: 'messages', title: 'Messages'},
        {id: 'queue_id', title: 'Queue ID'},
        {id: 'queue_name', title: 'Queue Name'},
    ];

    const create_csv_writer = CSVWriter.createObjectCsvWriter;
    let csv_writer = param_writer_object;

    if (!Validator.isValidObject(csv_writer)) {
        csv_writer = create_csv_writer(csv_writer_properties);
    }
    
    let param_issue_queue = param_issue['queue'];

    let records_to_write = [];
    let current_record_to_write = {
        issue_id: param_issue.id,
        assignee_id: param_issue.assignee_id,
        assignee_name: param_issue.assignee_name,
        author_hs_id: param_issue.hs_user_id,
        author_name: param_issue.author_name,
        queue_id: param_issue_queue.id,
        queue_name: param_issue_queue.name,
        // messages: JSON.stringify(param_issue.messages)
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
//     publishID: 20, // kiley-demo_app_20200811223959931-ccd2e7fa2401fb3
//     domain: 'kiley-demo',
//     issue: 814,
//     messages: test_messages_to_redact,
//     readKey: 'kiley-demo_api_20200903113320111-3ef245d31d67847',
//     writeKey: 'kiley-demo_api_20200903113320111-3ef245d31d67847'
// });

loginTest();