# villarosa

# Standalone server for accommodation management (motel/hotel/rent)   

## Technologies

* Kotlin
* Spring
* MySQL  
* Spring Data Jpa
* Jackson
* Swagger
* Maven

---

## Configuration

Use Java from `.java-version` and the checked-in Maven wrapper. The backend uses Spring Boot 4.1, Kotlin/Jakarta Persistence, and standard Spring datasource configuration.

For an isolated local database, set `VILLAS_DB_URL`, `VILLAS_DB_USERNAME`, and `VILLAS_DB_PASSWORD`. Set a local-only `VILLAS_LOCAL_PASSWORD`, then run:

```sh
./mvnw spring-boot:run -Dspring-boot.run.profiles=local
```

The explicit local profile keeps the existing Basic Auth console usable. It is development compatibility, with username `test` unless `VILLAS_LOCAL_USERNAME` overrides it. Google staff login is milestone 3. The default production mode denies business access, rejects development-auth settings, disables API docs, and does not initialize demo records. Schema setup must happen separately.

The canonical API uses `/api/v1`; the existing unversioned endpoints remain compatibility aliases. Local OpenAPI is available at `/v3/api-docs` and `/swagger-ui.html`. EUR and `Europe/Skopje` are the agreed property defaults.

---

# Build
In villarosa/ folder
* ./mvnw clean verify

To build with no tests:
* ./mvnw clean verify -DskipTests


# Run
Execute SQL script:
 /resources/database_setup.sql

In villarosa/ folder:
* ./mvnw spring-boot:run -Dspring-boot.run.profiles=local

# Operate
Access http://localhost:9098/swagger-ui.html

---

# UI (Local Frontend)

The frontend lives in `frontend/` and talks to the backend over Basic Auth.

## Start
From the repo root:

    cd frontend
    npm install
    npm run dev

Open the printed Vite URL (usually http://localhost:5173).

## Configure
- Base URL: `/api` (default, uses the Vite proxy to http://localhost:9098)
- Username: `test`
- Password: the value from `src/main/resources/application-default.yml`

---

## Endpoints

**Endpoint** -  /apartments

**Method** - GET

**No Request Parameters**

**Response**
        [
            {
            "id": 1,
            "capacity": 3,
            "orientation": "South",
            "view": "Lake",
            "regularPrice": 1500,
            "topSeasonPrice": 1800
            }
        ]



**Example**

    curl -X GET "http://<USER>:<PASSWORD>@localhost:9098/apartment" -H "accept: application/json"

---

**Endpoint** -  /customer

**Method** - POST

**Request Parameters**

| Name        | Type
| ------------- |-------------
| firstName     | String
| lastName      | String
| phone         | String
| address       | String

**Response**
        1

**Example**

    curl -X POST "http://<USER>:<PASSWORD>@localhost:9098/customer?address=some-street&firstName=fn&ln=dsfgsdfg&phone=123" -H "accept: application/json"
        
---

**Endpoint** -  /customer

**Method** - GET

**Request Parameters**

| Name        | Type
| ------------- |-------------
| firstName     | String
| phone         | String

**Response**

    [
        {
        "id": 2,
        "firstName": "fn",
        "lastName": "ln",
        "phone": "123",
        "address": "some-street"
        }
    ]

**Example**

    curl -H "Content-Type: application/json" -X GET 'http://<USER>:<PASSWORD>@localhost:9098/customerfirstName=test&phone=123456789
    
---

**Endpoint** -  /reservation

**Method** - POST

**Request Parameters**

| Name        | Type
| ------------- |-------------
| customerId     | Integer
| roomId         | Integer
| startDate      | String
| endDate        | String

**Response**

    1

**Example**

    curl -X POST "http://<USER>:<PASSWORD>@localhost:9098/reservation?customerId=1&endDate=2020-06-01&roomId=1&startDate=2020-05-01" -H "accept: application/json"
    
---


**Endpoint** -  /reservation/available-apartments

**Method** - GET

**Request Parameters**

| Name          | Type         |  
| ------------- |------------- 
| startDate     | String
| endDate       | String

**Response**

    [
        {
            "id": 1,
            "capacity": 3,
            "orientation": "South",
            "view": "Lake",
            "regularPrice": 1500,
            "topSeasonPrice": 1800
        },
        {
            "id": 2,
            "capacity": 3,
            "orientation": "South",
            "view": "Lake",
            "regularPrice": 1200,
            "topSeasonPrice": 1500
        }
]

**Example**

    curl -X GET "http://<USER>:<PASSWORD>@localhost:9098/reservation/available-apartments?endDate=2020-02-01&startDate=2020-01-01" -H "accept: application/json"
        
---


**Endpoint** -  /reservation/customer

**Method** - GET

**Request Parameters**

| Name          | Type         |  
| ------------- |------------- 
| customerId    | Integer

**Response**

    [
        {
            "id": 5,
            "customerId": 1,
            "roomId": 1,
            "startDate": "2020-05-01",
            "endDate": "2020-06-01"
            },
        {
            "id": 4,
            "customerId": 1,
            "roomId": 1,
            "startDate": "2020-02-11",
            "endDate": "2020-02-21"
        },
        {
            "id": 1,
            "customerId": 1,
            "roomId": 2,
            "startDate": "2020-02-01",
            "endDate": "2020-02-10"
        }
    ]


**Example**

    curl -X GET "http://<USER>:<PASSWORD>@localhost:9098/reservation/customer?customerId=1" -H "accept: application/json"


---


**Endpoint** -  /reservation

**Method** - DELETE

**Request Parameters**

| Name          | Type         |  
| ------------- |------------- 
| reservationId    | Integer

**Response**
    N/A


**Example**

    curl -X DELETE "http://<USER>:<PASSWORD>@localhost:9098/reservation/?reservationId=1" -H "accept: application/json"


---


**Endpoint** -  /reservation

**Method** - PATCH

**Request Parameters**

| Name          | Type         |  
| ------------- |------------- 
| reservationId    | Integer
| newRoomId        | Integer

**Response**
N/A


**Example**

    curl -X PATCH "http://<USER>:<PASSWORD>@localhost:9098/reservation/?newRoomId=1&reservationId=1" -H "accept: application/json"

        
